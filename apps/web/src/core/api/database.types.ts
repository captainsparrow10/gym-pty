export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export type Database = {
	// Allows to automatically instantiate createClient with right options
	// instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
	__InternalSupabase: {
		PostgrestVersion: "14.5";
	};
	graphql_public: {
		Tables: {
			[_ in never]: never;
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			graphql: {
				Args: {
					extensions?: Json;
					operationName?: string;
					query?: string;
					variables?: Json;
				};
				Returns: Json;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
	public: {
		Tables: {
			body_measurements: {
				Row: {
					body_fat_pct: number | null;
					chest_cm: number | null;
					created_at: string;
					date: string;
					hips_cm: number | null;
					id: string;
					left_arm_cm: number | null;
					left_calf_cm: number | null;
					left_forearm_cm: number | null;
					left_thigh_cm: number | null;
					neck_cm: number | null;
					note: string | null;
					right_arm_cm: number | null;
					right_calf_cm: number | null;
					right_forearm_cm: number | null;
					right_thigh_cm: number | null;
					shoulders_cm: number | null;
					user_id: string;
					waist_cm: number | null;
				};
				Insert: {
					body_fat_pct?: number | null;
					chest_cm?: number | null;
					created_at?: string;
					date?: string;
					hips_cm?: number | null;
					id?: string;
					left_arm_cm?: number | null;
					left_calf_cm?: number | null;
					left_forearm_cm?: number | null;
					left_thigh_cm?: number | null;
					neck_cm?: number | null;
					note?: string | null;
					right_arm_cm?: number | null;
					right_calf_cm?: number | null;
					right_forearm_cm?: number | null;
					right_thigh_cm?: number | null;
					shoulders_cm?: number | null;
					user_id: string;
					waist_cm?: number | null;
				};
				Update: {
					body_fat_pct?: number | null;
					chest_cm?: number | null;
					created_at?: string;
					date?: string;
					hips_cm?: number | null;
					id?: string;
					left_arm_cm?: number | null;
					left_calf_cm?: number | null;
					left_forearm_cm?: number | null;
					left_thigh_cm?: number | null;
					neck_cm?: number | null;
					note?: string | null;
					right_arm_cm?: number | null;
					right_calf_cm?: number | null;
					right_forearm_cm?: number | null;
					right_thigh_cm?: number | null;
					shoulders_cm?: number | null;
					user_id?: string;
					waist_cm?: number | null;
				};
				Relationships: [];
			};
			bodyweight: {
				Row: {
					date: string;
					id: string;
					user_id: string;
					weight_kg: number;
				};
				Insert: {
					date?: string;
					id?: string;
					user_id: string;
					weight_kg: number;
				};
				Update: {
					date?: string;
					id?: string;
					user_id?: string;
					weight_kg?: number;
				};
				Relationships: [];
			};
			exercise_notes: {
				Row: {
					body: string;
					created_at: string;
					exercise_slug: string;
					id: string;
					user_id: string;
				};
				Insert: {
					body: string;
					created_at?: string;
					exercise_slug: string;
					id?: string;
					user_id: string;
				};
				Update: {
					body?: string;
					created_at?: string;
					exercise_slug?: string;
					id?: string;
					user_id?: string;
				};
				Relationships: [];
			};
			logged_exercises: {
				Row: {
					exercise_slug: string;
					id: string;
					position: number;
					session_id: string;
				};
				Insert: {
					exercise_slug: string;
					id?: string;
					position: number;
					session_id: string;
				};
				Update: {
					exercise_slug?: string;
					id?: string;
					position?: number;
					session_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "logged_exercises_session_id_fkey";
						columns: ["session_id"];
						isOneToOne: false;
						referencedRelation: "sessions";
						referencedColumns: ["id"];
					},
				];
			};
			planned_exercises: {
				Row: {
					created_at: string;
					date: string;
					exercise_slug: string;
					id: string;
					note: string | null;
					position: number;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					date: string;
					exercise_slug: string;
					id?: string;
					note?: string | null;
					position?: number;
					user_id: string;
				};
				Update: {
					created_at?: string;
					date?: string;
					exercise_slug?: string;
					id?: string;
					note?: string | null;
					position?: number;
					user_id?: string;
				};
				Relationships: [];
			};
			profiles: {
				Row: {
					avatar_color: string;
					avatar_icon: string;
					created_at: string;
					display_name: string | null;
					id: string;
					public_profile: boolean;
					rest_seconds: number;
					unit: string;
					updated_at: string;
				};
				Insert: {
					avatar_color?: string;
					avatar_icon?: string;
					created_at?: string;
					display_name?: string | null;
					id: string;
					public_profile?: boolean;
					rest_seconds?: number;
					unit?: string;
					updated_at?: string;
				};
				Update: {
					avatar_color?: string;
					avatar_icon?: string;
					created_at?: string;
					display_name?: string | null;
					id?: string;
					public_profile?: boolean;
					rest_seconds?: number;
					unit?: string;
					updated_at?: string;
				};
				Relationships: [];
			};
			routine_exercises: {
				Row: {
					exercise_slug: string;
					id: string;
					position: number;
					routine_id: string;
				};
				Insert: {
					exercise_slug: string;
					id?: string;
					position: number;
					routine_id: string;
				};
				Update: {
					exercise_slug?: string;
					id?: string;
					position?: number;
					routine_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "routine_exercises_routine_id_fkey";
						columns: ["routine_id"];
						isOneToOne: false;
						referencedRelation: "routines";
						referencedColumns: ["id"];
					},
				];
			};
			routines: {
				Row: {
					created_at: string;
					id: string;
					name: string;
					notes: string | null;
					rating: number | null;
					updated_at: string;
					user_id: string;
					visibility: string;
					weekdays: number[];
				};
				Insert: {
					created_at?: string;
					id?: string;
					name: string;
					notes?: string | null;
					rating?: number | null;
					updated_at?: string;
					user_id: string;
					visibility?: string;
					weekdays?: number[];
				};
				Update: {
					created_at?: string;
					id?: string;
					name?: string;
					notes?: string | null;
					rating?: number | null;
					updated_at?: string;
					user_id?: string;
					visibility?: string;
					weekdays?: number[];
				};
				Relationships: [];
			};
			sessions: {
				Row: {
					created_at: string;
					date: string;
					duration_sec: number;
					finished_at: string | null;
					id: string;
					notes: string | null;
					routine_id: string | null;
					started_at: string;
					user_id: string;
				};
				Insert: {
					created_at?: string;
					date?: string;
					duration_sec?: number;
					finished_at?: string | null;
					id?: string;
					notes?: string | null;
					routine_id?: string | null;
					started_at?: string;
					user_id: string;
				};
				Update: {
					created_at?: string;
					date?: string;
					duration_sec?: number;
					finished_at?: string | null;
					id?: string;
					notes?: string | null;
					routine_id?: string | null;
					started_at?: string;
					user_id?: string;
				};
				Relationships: [
					{
						foreignKeyName: "sessions_routine_id_fkey";
						columns: ["routine_id"];
						isOneToOne: false;
						referencedRelation: "routines";
						referencedColumns: ["id"];
					},
				];
			};
			set_targets: {
				Row: {
					id: string;
					planned_exercise_id: string | null;
					position: number;
					reps: number | null;
					rest_seconds: number | null;
					routine_exercise_id: string | null;
					warmup: boolean;
					weight_kg: number | null;
				};
				Insert: {
					id?: string;
					planned_exercise_id?: string | null;
					position: number;
					reps?: number | null;
					rest_seconds?: number | null;
					routine_exercise_id?: string | null;
					warmup?: boolean;
					weight_kg?: number | null;
				};
				Update: {
					id?: string;
					planned_exercise_id?: string | null;
					position?: number;
					reps?: number | null;
					rest_seconds?: number | null;
					routine_exercise_id?: string | null;
					warmup?: boolean;
					weight_kg?: number | null;
				};
				Relationships: [
					{
						foreignKeyName: "set_targets_planned_exercise_id_fkey";
						columns: ["planned_exercise_id"];
						isOneToOne: false;
						referencedRelation: "planned_exercises";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "set_targets_routine_exercise_id_fkey";
						columns: ["routine_exercise_id"];
						isOneToOne: false;
						referencedRelation: "routine_exercises";
						referencedColumns: ["id"];
					},
				];
			};
			sets: {
				Row: {
					completed_at: string;
					id: string;
					logged_exercise_id: string;
					position: number;
					reps: number;
					seconds: number | null;
					warmup: boolean;
					weight_kg: number;
				};
				Insert: {
					completed_at?: string;
					id?: string;
					logged_exercise_id: string;
					position: number;
					reps?: number;
					seconds?: number | null;
					warmup?: boolean;
					weight_kg?: number;
				};
				Update: {
					completed_at?: string;
					id?: string;
					logged_exercise_id?: string;
					position?: number;
					reps?: number;
					seconds?: number | null;
					warmup?: boolean;
					weight_kg?: number;
				};
				Relationships: [
					{
						foreignKeyName: "sets_logged_exercise_id_fkey";
						columns: ["logged_exercise_id"];
						isOneToOne: false;
						referencedRelation: "logged_exercises";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: {
			[_ in never]: never;
		};
		Functions: {
			category_leaderboard: {
				Args: { p_days?: number; p_slugs: string[] };
				Returns: {
					avatar_color: string;
					avatar_icon: string;
					best_one_rm_kg: number;
					display_name: string;
					exercises: number;
					last_performed: string;
					reps: number;
					sessions: number;
					sets: number;
					top_weight_kg: number;
					user_id: string;
					volume_kg: number;
				}[];
			};
			distinct_count: { Args: { arr: number[] }; Returns: number };
			exercise_leaderboard: {
				Args: { p_days?: number; p_slug: string };
				Returns: {
					avatar_color: string;
					avatar_icon: string;
					best_one_rm_kg: number;
					display_name: string;
					last_performed: string;
					reps: number;
					sessions: number;
					sets: number;
					top_seconds: number;
					top_weight_kg: number;
					user_id: string;
					volume_kg: number;
				}[];
			};
			leaderboard: {
				Args: { p_days?: number };
				Returns: {
					avatar_color: string;
					avatar_icon: string;
					display_name: string;
					sessions: number;
					sets: number;
					user_id: string;
					volume_kg: number;
				}[];
			};
			reorder_logged_exercises: {
				Args: { p_ids: string[] };
				Returns: undefined;
			};
			reorder_routine_exercises: {
				Args: { p_ids: string[] };
				Returns: undefined;
			};
		};
		Enums: {
			[_ in never]: never;
		};
		CompositeTypes: {
			[_ in never]: never;
		};
	};
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
	keyof Database,
	"public"
>];

export type Tables<
	DefaultSchemaTableNameOrOptions extends
		| keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
				DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
			DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
			Row: infer R;
		}
		? R
		: never
	: DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
				DefaultSchema["Views"])
		? (DefaultSchema["Tables"] &
				DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
				Row: infer R;
			}
			? R
			: never
		: never;

export type TablesInsert<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Insert: infer I;
		}
		? I
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Insert: infer I;
			}
			? I
			: never
		: never;

export type TablesUpdate<
	DefaultSchemaTableNameOrOptions extends
		| keyof DefaultSchema["Tables"]
		| { schema: keyof DatabaseWithoutInternals },
	TableName extends DefaultSchemaTableNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
		: never = never,
> = DefaultSchemaTableNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
			Update: infer U;
		}
		? U
		: never
	: DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
		? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
				Update: infer U;
			}
			? U
			: never
		: never;

export type Enums<
	DefaultSchemaEnumNameOrOptions extends
		| keyof DefaultSchema["Enums"]
		| { schema: keyof DatabaseWithoutInternals },
	EnumName extends DefaultSchemaEnumNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
		: never = never,
> = DefaultSchemaEnumNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
	: DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
		? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
		: never;

export type CompositeTypes<
	PublicCompositeTypeNameOrOptions extends
		| keyof DefaultSchema["CompositeTypes"]
		| { schema: keyof DatabaseWithoutInternals },
	CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
		schema: keyof DatabaseWithoutInternals;
	}
		? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
		: never = never,
> = PublicCompositeTypeNameOrOptions extends {
	schema: keyof DatabaseWithoutInternals;
}
	? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
	: PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
		? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
		: never;

export const Constants = {
	graphql_public: {
		Enums: {},
	},
	public: {
		Enums: {},
	},
} as const;
