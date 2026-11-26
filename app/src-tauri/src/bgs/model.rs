//! BGS Watch, the data shapes: what is stored (numbers only) and what a scan proposes to the confirm table.
use serde::{Deserialize, Serialize};

/// one system of a stored snapshot
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct StoredRow {
    pub system: String,
    /// influence times ten (66.9 % = 669), None when it could not be read and the player left it open
    pub inf_x10: Option<i32>,
    #[serde(default)]
    pub star: bool,
    #[serde(default)]
    pub conf: f32,
    /// the player looked at this row (confirmed or corrected it)
    #[serde(default)]
    pub confirmed: bool,
    /// the player saved this row although it was still marked uncertain and did not look at it (the UI asked first)
    #[serde(default)]
    pub accepted_unchecked: bool,
    /// the player typed this value in the Edit table (it is a correction, shown as such)
    #[serde(default)]
    pub edited: bool,
    /// sent by the UI with a commit: this row was uncertain
    #[serde(default, skip_serializing)]
    pub flagged: bool,
    /// sent by the UI with a commit: the row's position in the proposal (for learning from a correction)
    #[serde(default, skip_serializing)]
    pub pos: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Snapshot {
    #[serde(default)]
    pub v: u32,
    pub id: String,
    /// when the first page was taken (Journal Screenshot event time)
    pub taken_utc: String,
    /// when the numbers are from: taken time minus the page's LAST UPDATED minutes (equal to taken_utc when not readable)
    pub data_utc: String,
    #[serde(default)]
    pub minutes_old: Option<u32>,
    #[serde(default)]
    pub resolution: String,
    /// file names only, never the pictures
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub pages: Option<u32>,
    #[serde(default)]
    pub complete: bool,
    pub rows: Vec<StoredRow>,
    #[serde(default)]
    pub reader: String,
    /// read from an imported CSV (for example a friend's export), not from this PC's own screenshots
    #[serde(default)]
    pub imported: bool,
    /// the proposal this snapshot was made from (never stored): lets the backend know which rows were flagged and what was read
    #[serde(default, skip_serializing)]
    pub proposal_id: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Issue {
    /// stable key for the UI text: "bgs.issue.<code>"
    pub code: &'static str,
    pub msg: String,
    pub page: Option<u32>,
    /// true = the snapshot cannot be saved until this is fixed (a page is missing, the row count is wrong)
    pub blocking: bool,
}

/// one row of the confirm table
#[derive(Serialize, Clone, Debug, Default)]
pub struct Cell {
    pub page: u32,
    /// the screenshot file this row was read from
    pub file: String,
    /// position in the whole list, 1 based
    pub pos: u32,
    pub read_name: String,
    /// the name to save: the known list's spelling when the name matched or was snapped, else as read
    pub system: String,
    /// "exact" (equal to a known name), "snapped" (a near known name was taken), "not_in_list", "unsure" (no list, weak reading), "ok" (no list, strong reading)
    pub name_state: &'static str,
    /// 0..1 score of the reading (not a probability): 1 minus the match cost, times how far the best character is from the second best
    pub name_conf: f32,
    /// other readings or near known names, best first
    pub name_alts: Vec<String>,
    pub inf: String,
    pub inf_x10: Option<i32>,
    pub inf_conf: f32,
    pub inf_alts: Vec<String>,
    pub inf_unsure: bool,
    pub star: bool,
    /// "sure", "snapped", "unsure", "order" (breaks the sorted order), "jump" (changed a lot since the last snapshot)
    pub state: &'static str,
    pub reasons: Vec<&'static str>,
    pub prev_x10: Option<i32>,
    /// true when the player should look at this row
    pub uncertain: bool,
    /// the value as the second reading sees it, when the two readings differ
    pub inf_second: Option<String>,
    /// small PNG crops (data URLs) of a flagged name and a flagged value cell, made in memory for this answer only, never stored
    pub crop_name: Option<String>,
    pub crop_inf: Option<String>,
    #[serde(skip)]
    pub name_box: [i64; 4],
    #[serde(skip)]
    pub inf_box: [i64; 4],
    #[serde(skip)]
    pub name_glyphs: Vec<(Vec<u8>, f32)>,
    #[serde(skip)]
    pub inf_glyphs: Vec<(Vec<u8>, f32)>,
    #[serde(skip)]
    pub cap_h: f64,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Proposal {
    pub id: String,
    pub files: Vec<String>,
    pub resolution: String,
    pub taken_utc: String,
    pub data_utc: String,
    pub minutes_old: Option<u32>,
    pub pages_found: Vec<u32>,
    pub pages_total: Option<u32>,
    pub systems_read: Option<u32>,
    pub complete: bool,
    /// no blocking issue: the table can be saved once the player has looked at the uncertain rows
    pub can_save: bool,
    pub uncertain_rows: usize,
    pub rows: Vec<Cell>,
    pub issues: Vec<Issue>,
    pub already_saved: bool,
    /// how many known system names were used for snapping (0 = no list yet)
    pub names_known: usize,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct Skipped {
    pub file: String,
    pub why: String,
}
