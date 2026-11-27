import sprint48 from "../../samples/presets/sprint-48.json";
import studyWeek from "../../samples/presets/study-week.json";
import workoutHalfday from "../../samples/presets/workout-halfday.json";

/** The eleven fields of the opening form, exactly as the contract takes them. */
export type PresetForm = {
  id: string;
  title: string;
  goal: string;
  periods: string;
  periodDays: string;
  stake: string;
  maxMembers: string;
  rounds: string;
  intervalMinutes: string;
  joinHours: string;
  rulingHours: string;
};

export type Preset = {
  id: string;
  name: string;
  description: string;
  form: PresetForm;
};

/**
 * Presets that fill the opening form on the home page. They are shipped with the console, so a
 * tester starts from values the contract accepts instead of guessing its limits. Pressing one
 * only fills the form: nothing is sent until the user signs.
 */
export const PRESETS: Preset[] = [sprint48, studyWeek, workoutHalfday] as unknown as Preset[];
