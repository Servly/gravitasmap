//! DEBRIEF: the game's ship actions, as a pilot reads them. The Bindings file holds only the game's internal names (ToggleFlightAssist,
//! UseBoostJuice...), no file has the words the Controls screen shows, so the wording here is ours, kept short. Every label is a plain word of
//! the game's own vocabulary (Flight Assist, Boost, Heat Sink...). An action that is not in this table is shown by its internal name,
//! never guessed. (Wording to be checked against the Controls screen: see DEBRIEF.md.)

/// (the game's name, our label, a toggle: pressing it flips a state, so how long the key was held says nothing)
pub const SHIP: &[(&str, &str, bool)] = &[
    ("PitchUpButton", "Pitch Up", false),
    ("PitchDownButton", "Pitch Down", false),
    ("RollLeftButton", "Roll Left", false),
    ("RollRightButton", "Roll Right", false),
    ("YawLeftButton", "Yaw Left", false),
    ("YawRightButton", "Yaw Right", false),
    ("LeftThrustButton", "Thrust Left", false),
    ("RightThrustButton", "Thrust Right", false),
    ("UpThrustButton", "Thrust Up", false),
    ("DownThrustButton", "Thrust Down", false),
    ("ForwardThrustButton", "Forward Thrust", false),
    ("BackwardThrustButton", "Backward Thrust", false),
    ("ForwardKey", "Throttle Forward", false),
    ("BackwardKey", "Throttle Backward", false),
    ("SetSpeedZero", "Set Speed 0 %", false),
    ("SetSpeed25", "Set Speed 25 %", false),
    ("SetSpeed50", "Set Speed 50 %", false),
    ("SetSpeed75", "Set Speed 75 %", false),
    ("SetSpeed100", "Set Speed 100 %", false),
    ("ToggleFlightAssist", "Flight Assist", true),
    ("UseBoostJuice", "Boost", false),
    ("BlockMouseDecay", "Block Mouse Decay", false),
    ("PrimaryFire", "Primary Fire", false),
    ("SecondaryFire", "Secondary Fire", false),
    ("CycleFireGroupNext", "Next Fire Group", false),
    ("CycleFireGroupPrevious", "Previous Fire Group", false),
    ("DeployHardpointToggle", "Hardpoints", true),
    ("DeployHeatSink", "Heat Sink", false),
    ("FireChaffLauncher", "Chaff", false),
    ("UseShieldCell", "Shield Cell", false),
    ("ChargeECM", "ECM", false),
    ("TriggerFieldNeutraliser", "Neutraliser", false),
    ("ShipSpotLightToggle", "Ship Lights", true),
    ("ToggleCargoScoop", "Cargo Scoop", true),
    ("LandingGearToggle", "Landing Gear", true),
    ("ToggleButtonUpInput", "Silent Running", true),
    ("HyperSuperCombination", "Frame Shift Drive", false),
    ("Supercruise", "Supercruise", false),
    ("Hyperspace", "Hyperspace", false),
    ("SelectTarget", "Target Ahead", false),
    ("CycleNextTarget", "Next Target", false),
    ("CyclePreviousTarget", "Previous Target", false),
    ("SelectHighestThreat", "Highest Threat", false),
    ("CycleNextHostileTarget", "Next Hostile Target", false),
    ("CyclePreviousHostileTarget", "Previous Hostile Target", false),
    ("TargetWingman0", "Wingman 1", false),
    ("TargetWingman1", "Wingman 2", false),
    ("TargetWingman2", "Wingman 3", false),
    ("SelectTargetsTarget", "Wingman's Target", false),
    ("WingNavLock", "Wing Nav Lock", false),
    ("CycleNextSubsystem", "Next Subsystem", false),
    ("CyclePreviousSubsystem", "Previous Subsystem", false),
    ("IncreaseEnginesPower", "Power to Engines", false),
    ("IncreaseWeaponsPower", "Power to Weapons", false),
    ("IncreaseSystemsPower", "Power to Systems", false),
    ("ResetPowerDistribution", "Balance Power", false),
    ("HeadLookToggle", "Free Look", true),
];

/// The game's name of an action as it appears in the table, or None.
pub fn known(id: &str) -> Option<&'static (&'static str, &'static str, bool)> {
    SHIP.iter().find(|a| a.0 == id)
}

/// Our label for an action: the table's, or the game's own internal name when the table has nothing (never a guess).
pub fn label(id: &str) -> String {
    known(id).map(|a| a.1.to_string()).unwrap_or_else(|| id.to_string())
}

pub fn is_toggle(id: &str) -> bool {
    known(id).is_some_and(|a| a.2)
}

/// A key as it is written on the keyboard (from the game's own name for it): "Key_W" is W, "Mouse_1" the left mouse button.
pub fn key_label(key: &str) -> String {
    if let Some(k) = key.strip_prefix("Key_") {
        if let Some(n) = k.strip_prefix("Numpad_") { return format!("Num {n}"); }
        return match k {
            "LeftControl" => "L-Ctrl".into(), "RightControl" => "R-Ctrl".into(), "LeftShift" => "L-Shift".into(), "RightShift" => "R-Shift".into(),
            "LeftAlt" => "L-Alt".into(), "RightAlt" => "R-Alt".into(), "UpArrow" => "Up".into(), "DownArrow" => "Down".into(),
            "LeftArrow" => "Left".into(), "RightArrow" => "Right".into(), "DoubleQuote" => "\"".into(), "Asterisk" => "*".into(), "LessThan" => "<".into(),
            "Minus" => "-".into(), "Equals" => "=".into(), "Comma" => ",".into(), "Period" => ".".into(), "Slash" => "/".into(),
            o => o.to_string(),
        };
    }
    match key {
        "Mouse_1" => "Left mouse".into(), "Mouse_2" => "Right mouse".into(), "Mouse_3" => "Middle mouse".into(),
        "Mouse_4" => "Mouse 4".into(), "Mouse_5" => "Mouse 5".into(),
        "Pos_Mouse_ZAxis" => "Wheel up".into(), "Neg_Mouse_ZAxis" => "Wheel down".into(),
        o => o.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_come_from_the_table_and_never_from_a_guess() {
        assert_eq!(label("ToggleFlightAssist"), "Flight Assist");
        assert_eq!(label("SomethingNew"), "SomethingNew"); // (the game's own name, not an invented word)
        assert!(is_toggle("ToggleFlightAssist") && !is_toggle("PrimaryFire") && !is_toggle("SomethingNew"));
        assert_eq!(key_label("Key_W"), "W");
        assert_eq!(key_label("Key_Numpad_8"), "Num 8");
        assert_eq!(key_label("Mouse_1"), "Left mouse");
        let mut ids: Vec<&str> = SHIP.iter().map(|a| a.0).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), SHIP.len(), "an action twice in the table");
    }
}
