//! BGS Watch: the Edit table's backend (cell corrections, moving a snapshot in time, deleting one).
use super::model::{Snapshot, StoredRow};
use super::snapstore::Store;
use serde_json::json;

fn tmp(name: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("gravitas-bgs-test6-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn snap(t: &str, rows: &[(&str, i32)]) -> Snapshot {
    let s = super::timeutil::parse_iso(t).unwrap();
    Snapshot { v: 1, id: super::timeutil::fmt_id(s), taken_utc: t.into(), data_utc: t.into(), complete: true, reader: "bgs1".into(),
        rows: rows.iter().map(|(n, v)| StoredRow { system: (*n).into(), inf_x10: Some(*v), conf: 0.4, ..Default::default() }).collect(), ..Default::default() }
}

#[test]
fn a_typed_cell_replaces_a_misread_value_and_is_marked_as_a_correction() {
    let st = Store::at(tmp("a")).unwrap();
    let id = st.save(snap("2026-11-26T03:59:24Z", &[("Serra", 687), ("Gunwin", 669)])).unwrap();
    let r = super::edit_in(&st, &json!({"edits": [{"id": id, "cells": [{"system": "serra", "inf_x10": 637}]}]}));
    assert_eq!(r["ok"], true, "{r}");
    let s = st.get(&id).unwrap();
    let row = s.rows.iter().find(|r| r.system == "Serra").unwrap();
    assert_eq!(row.inf_x10, Some(637));
    assert!(row.edited && row.confirmed && !row.accepted_unchecked);
    assert!(!s.rows.iter().find(|r| r.system == "Gunwin").unwrap().edited, "an untouched row stays as it was");
    // the same value typed again is not a correction
    let r2 = super::edit_in(&st, &json!({"edits": [{"id": id, "cells": [{"system": "Gunwin", "inf_x10": 669}]}]}));
    assert_eq!(r2["ok"], true);
    assert!(!st.get(&id).unwrap().rows.iter().find(|r| r.system == "Gunwin").unwrap().edited);
}

#[test]
fn bad_values_are_refused_and_nothing_is_written() {
    let st = Store::at(tmp("b")).unwrap();
    let id = st.save(snap("2026-11-26T03:59:24Z", &[("Serra", 687)])).unwrap();
    for bad in [json!(1001), json!(-1), json!("68.7"), json!(68.7)] {
        let r = super::edit_in(&st, &json!({"edits": [{"id": id, "cells": [{"system": "Serra", "inf_x10": bad}]}]}));
        assert_eq!(r["ok"], false, "{r}");
    }
    // one bad edit among good ones stops the whole call
    let r = super::edit_in(&st, &json!({"edits": [{"id": id, "cells": [{"system": "Serra", "inf_x10": 500}]}, {"id": "nope", "cells": []}]}));
    assert_eq!(r["ok"], false);
    assert_eq!(st.get(&id).unwrap().rows[0].inf_x10, Some(687), "nothing was written");
}

#[test]
fn a_cell_can_be_cleared_and_a_new_system_can_be_added() {
    let st = Store::at(tmp("c")).unwrap();
    let id = st.save(snap("2026-11-26T03:59:24Z", &[("Serra", 687)])).unwrap();
    let r = super::edit_in(&st, &json!({"edits": [{"id": id, "cells": [{"system": "Serra", "inf_x10": null}, {"system": "New Place", "inf_x10": 555}]}]}));
    assert_eq!(r["ok"], true, "{r}");
    let s = st.get(&id).unwrap();
    assert_eq!(s.rows.iter().find(|r| r.system == "Serra").unwrap().inf_x10, None);
    assert_eq!(s.rows.iter().find(|r| r.system == "New Place").unwrap().inf_x10, Some(555));
    let bad = super::edit_in(&st, &json!({"edits": [{"id": id, "cells": [{"system": "Bad\u{7}Name", "inf_x10": 500}]}]}));
    assert_eq!(bad["ok"], false);
}

#[test]
fn a_snapshot_can_be_moved_to_another_time_but_not_onto_another_snapshot() {
    let st = Store::at(tmp("d")).unwrap();
    let a = st.save(snap("2026-11-25T05:23:37Z", &[("Serra", 666)])).unwrap();
    let b = st.save(snap("2026-11-26T03:59:24Z", &[("Serra", 680)])).unwrap();
    let r = super::edit_in(&st, &json!({"edits": [{"id": a, "data_utc": "2026-11-25T06:10:00Z", "cells": []}]}));
    assert_eq!(r["ok"], true, "{r}");
    let new_id = r["ids"][0].as_str().unwrap().to_string();
    assert_ne!(new_id, a);
    assert!(st.get(&a).is_none(), "the old file is gone");
    assert_eq!(st.get(&new_id).unwrap().data_utc, "2026-11-25T06:10:00Z");
    assert_eq!(st.all().len(), 2);
    let clash = super::edit_in(&st, &json!({"edits": [{"id": new_id, "data_utc": "2026-11-26T03:59:24Z", "cells": []}]}));
    assert_eq!(clash["ok"], false);
    assert!(st.get(&b).is_some() && st.get(&new_id).is_some(), "both are still there");
    let bad = super::edit_in(&st, &json!({"edits": [{"id": b, "data_utc": "yesterday", "cells": []}]}));
    assert_eq!(bad["ok"], false);
}

#[test]
fn a_snapshot_can_be_deleted_and_the_rest_stays() {
    let st = Store::at(tmp("e")).unwrap();
    let a = st.save(snap("2026-11-25T05:23:37Z", &[("Serra", 666)])).unwrap();
    let b = st.save(snap("2026-11-26T03:59:24Z", &[("Serra", 680)])).unwrap();
    st.delete(&a).unwrap();
    assert!(st.get(&a).is_none());
    assert_eq!(st.all().len(), 1);
    assert_eq!(st.ids(), vec![b.clone()]);
    assert!(st.delete(&a).is_err(), "deleting twice is an error, not a crash");
    assert!(st.delete("../x").is_err(), "an id is never a path");
}
