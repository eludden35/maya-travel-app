export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          approved_path: string | null
          bytes: number
          created_at: string
          exif_stripped_at: string
          height: number | null
          id: string
          intended_use: string
          mime_type: string
          pending_path: string
          rejection_reason:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewed_at: string | null
          reviewed_by: string | null
          scanned_at: string | null
          state: Database["public"]["Enums"]["image_state"]
          uploader_id: string
          width: number | null
        }
        Insert: {
          approved_path?: string | null
          bytes: number
          created_at?: string
          exif_stripped_at?: string
          height?: number | null
          id?: string
          intended_use: string
          mime_type: string
          pending_path: string
          rejection_reason?:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scanned_at?: string | null
          state?: Database["public"]["Enums"]["image_state"]
          uploader_id: string
          width?: number | null
        }
        Update: {
          approved_path?: string | null
          bytes?: number
          created_at?: string
          exif_stripped_at?: string
          height?: number | null
          id?: string
          intended_use?: string
          mime_type?: string
          pending_path?: string
          rejection_reason?:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scanned_at?: string | null
          state?: Database["public"]["Enums"]["image_state"]
          uploader_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_decisions: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          image_id: string
          notes: string | null
          rejection_reason:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewer_id: string | null
          reviewer_kind: Database["public"]["Enums"]["moderation_actor_kind"]
          verdict: Database["public"]["Enums"]["moderation_verdict"]
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          image_id: string
          notes?: string | null
          rejection_reason?:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewer_id?: string | null
          reviewer_kind: Database["public"]["Enums"]["moderation_actor_kind"]
          verdict: Database["public"]["Enums"]["moderation_verdict"]
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          image_id?: string
          notes?: string | null
          rejection_reason?:
            | Database["public"]["Enums"]["rejection_reason"]
            | null
          reviewer_id?: string | null
          reviewer_kind?: Database["public"]["Enums"]["moderation_actor_kind"]
          verdict?: Database["public"]["Enums"]["moderation_verdict"]
        }
        Relationships: [
          {
            foreignKeyName: "moderation_decisions_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_decisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mutes: {
        Row: {
          created_at: string
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string
          muted_id?: string
          muter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutes_muted_id_fkey"
            columns: ["muted_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutes_muter_id_fkey"
            columns: ["muter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string
          handle: string
          id: string
          is_discoverable: boolean
          is_moderator: boolean
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name: string
          handle: string
          id: string
          is_discoverable?: boolean
          is_moderator?: boolean
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          is_discoverable?: boolean
          is_moderator?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_counters: {
        Row: {
          count: number
          profile_id: string
          surface: string
          window_start: string
        }
        Insert: {
          count?: number
          profile_id: string
          surface: string
          window_start: string
        }
        Update: {
          count?: number
          profile_id?: string
          surface?: string
          window_start?: string
        }
        Relationships: []
      }
      tos_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip: string | null
          profile_id: string
          user_agent: string | null
          version: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip?: string | null
          profile_id: string
          user_agent?: string | null
          version: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip?: string | null
          profile_id?: string
          user_agent?: string | null
          version?: string
        }
        Relationships: []
      }
      trip_members: {
        Row: {
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["trip_member_role"]
          trip_id: string
        }
        Insert: {
          joined_at?: string
          profile_id: string
          role?: Database["public"]["Enums"]["trip_member_role"]
          trip_id: string
        }
        Update: {
          joined_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["trip_member_role"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          organizer_id: string
          start_date: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["trip_visibility"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          organizer_id: string
          start_date?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["trip_visibility"]
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          organizer_id?: string
          start_date?: string | null
          updated_at?: string
          visibility?: Database["public"]["Enums"]["trip_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "trips_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_moderator: { Args: { profile_id: string }; Returns: boolean }
      try_consume_rate_limit: {
        Args: {
          p_max: number
          p_profile_id: string
          p_surface: string
          p_window_seconds: number
        }
        Returns: boolean
      }
    }
    Enums: {
      image_state: "pending_media" | "pending_review" | "approved" | "rejected"
      moderation_actor_kind: "human" | "system"
      moderation_verdict: "approve" | "reject"
      rejection_reason:
        | "nudity"
        | "violence"
        | "minors"
        | "csam"
        | "unrelated_to_trip"
        | "spam"
        | "other"
      trip_member_role: "organizer" | "member"
      trip_visibility: "private" | "unlisted" | "public"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      image_state: ["pending_media", "pending_review", "approved", "rejected"],
      moderation_actor_kind: ["human", "system"],
      moderation_verdict: ["approve", "reject"],
      rejection_reason: [
        "nudity",
        "violence",
        "minors",
        "csam",
        "unrelated_to_trip",
        "spam",
        "other",
      ],
      trip_member_role: ["organizer", "member"],
      trip_visibility: ["private", "unlisted", "public"],
    },
  },
} as const

