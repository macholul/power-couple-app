export type CompletionStatus = "submitted" | "approved";
export type AvatarCharacter = "mae" | "baris";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  avatar_character: AvatarCharacter;
  timezone: string | null;
  created_at: string;
}

export interface Couple {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
}

export interface Task {
  id: string;
  couple_id: string;
  assigned_to: string;
  title: string;
  scheduled_weekdays: number[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCompletion {
  id: string;
  task_id: string;
  submitted_by: string;
  photo_url: string;
  status: CompletionStatus;
  scheduled_date: string;
  reviewed_by: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface DaySchedule {
  user_id: string;
  /** YYYY-MM-DD in the owner's local calendar */
  date_key: string;
  /** the goals that were actually scheduled for that day; frozen once past */
  task_ids: string[];
  updated_at: string;
}

export interface LoveNote {
  id: string;
  couple_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  dismissed_at: string | null;
}
