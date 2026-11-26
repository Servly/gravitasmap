//! BGS Watch: Import CSV tests (the file Export CSV writes, read back by another PC).
use super::csvimport::{apply, plan, summary};
use super::model::{Snapshot, StoredRow};
use super::snapstore::Store;

fn tmp(name: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("gravitas-bgs-test5-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn row(n: &str, v: Option<i32>, ok: bool) -> StoredRow {
    StoredRow { system: n.into(), inf_x10: v, confirmed: ok, accepted_unchecked: !ok, conf: if ok { 1.0 } else { 0.5 }, ..Default::default() }
}

fn snap(t: &str, rows: Vec<StoredRow>) -> Snapshot {
    let s = super::timeutil::parse_iso(t).unwrap();
    Snapshot { v: 1, id: super::timeutil::fmt_id(s), taken_utc: t.into(), data_utc: t.into(), complete: true, rows, reader: "bgs1".into(), ..Default::default() }
}

fn known() -> Vec<String> { vec!["Serra".into(), "Gunwin".into(), "Col 285 Sector VR-E B27-1".into()] }

#[test]
fn an_export_is_read_back_into_an_empty_store_at_the_same_times() {
    let a = Store::at(tmp("a")).unwrap();
    a.save(snap("2026-11-25T05:20:00Z", vec![row("Serra", Some(664), true), row("Gunwin", Some(669), true), row("Col 285 Sector VR-E B27-1", Some(640), false)])).unwrap();
    a.save(snap("2026-11-26T04:59:00Z", vec![row("Serra", Some(680), true), row("Gunwin", Some(669), true), row("Col 285 Sector VR-E B27-1", Some(645), true)])).unwrap();
    let csv = a.csv();
    let b = Store::at(tmp("b")).unwrap();
    let p = plan(&csv, &b, &known(), 300).unwrap();
    assert_eq!(p.groups.len(), 2);
    assert_eq!(p.bad_rows, 0);
    let s = summary(&p);
    assert_eq!(s["to_add"], 2);
    assert_eq!(s["groups"][0]["unchecked_rows"], 1, "the row the friend did not check stays marked");
    let ids = apply(&p, &b, 3).unwrap();
    assert_eq!(ids.len(), 2);
    let got = b.all();
    assert_eq!(got.len(), 2);
    assert_eq!(got[0].data_utc, "2026-11-25T05:20:00Z", "placed at the time of the snapshot, oldest first");
    assert_eq!(got[1].rows.iter().find(|r| r.system == "Serra").unwrap().inf_x10, Some(680));
    assert!(got.iter().all(|s| s.imported && s.reader == "csv"));
    assert!(got[0].rows.iter().find(|r| r.system.starts_with("Col 285")).unwrap().accepted_unchecked);
    assert!(got[0].complete, "all 3 known systems are there");
}

#[test]
fn the_same_file_twice_adds_nothing_the_second_time() {
    let a = Store::at(tmp("c")).unwrap();
    a.save(snap("2026-11-26T04:59:00Z", vec![row("Serra", Some(680), true)])).unwrap();
    let csv = a.csv();
    let b = Store::at(tmp("d")).unwrap();
    apply(&plan(&csv, &b, &known(), 300).unwrap(), &b, 3).unwrap();
    let again = plan(&csv, &b, &known(), 300).unwrap();
    assert_eq!(summary(&again)["to_add"], 0);
    assert_eq!(again.groups[0].skip, "already_have");
    assert_eq!(apply(&again, &b, 3).unwrap().len(), 0);
    assert_eq!(b.all().len(), 1);
    // a stored snapshot a few minutes away counts as the same one, an hour away does not
    let near = "snapshot_utc,system,influence_percent\n2026-11-26T05:02:00Z,Serra,68.0\n2026-11-26T06:30:00Z,Serra,67.0\n";
    let p = plan(near, &b, &known(), 300).unwrap();
    assert_eq!(p.groups[0].skip, "already_have");
    assert_eq!(p.groups[1].skip, "");
}

#[test]
fn bad_rows_unknown_names_and_foreign_files_are_reported() {
    let b = Store::at(tmp("e")).unwrap();
    let csv = "\u{feff}snapshot_utc,system,influence_percent,change_vs_previous,confirmed\r\n\
        2026-11-26T04:59:00Z,serra,68.0,,yes\r\n\
        2026-11-26T04:59:00Z,Gunwin,101.0,,yes\r\n\
        2026-11-26T04:59:00Z,Gunwin,abc,,yes\r\n\
        2026-11-26T04:59:00Z,Mystery Place,50.5,,yes\r\n\
        not a time,Serra,50.0,,yes\r\n\
        2026-11-26T04:59:00Z,Serra,60.0,,yes\r\n\
        2026-11-26T04:59:00Z,\"Bad\x07Name\",60.0,,yes\r\n";
    let p = plan(csv, &b, &known(), 300).unwrap();
    assert_eq!(p.groups.len(), 1);
    assert_eq!(p.bad_rows, 5, "101.0, abc, a bad time, a repeated system and a control character");
    let g = &p.groups[0];
    assert_eq!(g.rows.len(), 2, "Serra and Mystery Place");
    assert_eq!(g.rows[0].system, "Serra", "the known list's spelling is used");
    assert_eq!(g.not_in_list, vec!["Mystery Place".to_string()]);
    assert!(plan("a,b,c\n1,2,3\n", &b, &known(), 300).is_err(), "not a GRAVITAS export");
    assert!(plan("", &b, &known(), 300).is_err());
}

#[test]
fn no_influence_value_beyond_the_columns_is_kept() {
    // the "change" column and any extra column are ignored: only time, system, value and the confirmed flag are used
    let b = Store::at(tmp("f")).unwrap();
    let csv = "snapshot_utc,system,influence_percent,change_vs_previous,confirmed,extra\n2026-11-26T04:59:00Z,Serra,68.0,+9.9,yes,secret\n";
    let p = plan(csv, &b, &[], 300).unwrap();
    let ids = apply(&p, &b, 0).unwrap();
    let text = serde_json::to_string(&b.all()).unwrap();
    assert!(!text.contains("secret") && !text.contains("9.9"), "{text}");
    assert_eq!(ids.len(), 1);
}

