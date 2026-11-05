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
      expense_shares: {
        Row: {
          amount: number
          expense_id: string
          member_id: string
          trip_id: string
        }
        Insert: {
          amount: number
          expense_id: string
          member_id: string
          trip_id: string
        }
        Update: {
          amount?: number
          expense_id?: string
          member_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_id_trip_id_fkey"
            columns: ["expense_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id", "trip_id"]
          },
          {
            foreignKeyName: "expense_shares_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          id: string
          payer_id: string
          split: Database["public"]["Enums"]["expense_split"]
          trip_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          id?: string
          payer_id: string
          split: Database["public"]["Enums"]["expense_split"]
          trip_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          id?: string
          payer_id?: string
          split?: Database["public"]["Enums"]["expense_split"]
          trip_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
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
      trip_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_uses: number
          revoked_at: string | null
          token: string
          trip_id: string
          uses: number
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          max_uses: number
          revoked_at?: string | null
          token: string
          trip_id: string
          uses?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          token?: string
          trip_id?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invites_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
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
          currency: string
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
          currency?: string
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
          currency?: string
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
      accept_tos: {
        Args: { p_ip?: string; p_user_agent?: string; p_version: string }
        Returns: string
      }
      accept_trip_invite: {
        Args: { p_token: string }
        Returns: {
          status: string
          trip_id: string
        }[]
      }
      can_complete_onboarding: {
        Args: { p_invite_token?: string }
        Returns: boolean
      }
      can_invite_new_accounts: { Args: never; Returns: boolean }
      complete_onboarding: {
        Args: {
          p_display_name: string
          p_handle: string
          p_invite_token?: string
          p_ip?: string
          p_tos_version: string
          p_user_agent?: string
        }
        Returns: string
      }
      consume_rate_limit: { Args: { p_surface: string }; Returns: number }
      create_expense: {
        Args: {
          p_amount: number
          p_amounts?: number[]
          p_description: string
          p_member_ids: string[]
          p_payer_id: string
          p_split: Database["public"]["Enums"]["expense_split"]
          p_trip_id: string
        }
        Returns: {
          expense_id: string
          status: string
        }[]
      }
      create_trip: {
        Args: {
          p_currency: string
          p_description?: string
          p_end_date?: string
          p_name: string
          p_start_date?: string
        }
        Returns: {
          status: string
          trip_id: string
        }[]
      }
      create_trip_invite: {
        Args: {
          p_expires_in_days: number
          p_max_uses: number
          p_trip_id: string
        }
        Returns: {
          invite_id: string
          status: string
          token: string
        }[]
      }
      delete_expense: { Args: { p_expense_id: string }; Returns: string }
      delete_trip: { Args: { p_trip_id: string }; Returns: string }
      get_trip: {
        Args: { p_trip_id: string }
        Returns: {
          created_at: string
          currency: string
          description: string | null
          end_date: string | null
          id: string
          name: string
          organizer_id: string
          start_date: string | null
          updated_at: string
          visibility: Database["public"]["Enums"]["trip_visibility"]
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_trip_invite_preview: {
        Args: { p_token: string }
        Returns: {
          end_date: string
          member_count: number
          organizer_display_name: string
          start_date: string
          trip_id: string
          trip_name: string
        }[]
      }
      get_trip_members: {
        Args: { p_trip_id: string }
        Returns: {
          display_name: string
          handle: string
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["trip_member_role"]
        }[]
      }
      is_moderator: { Args: { profile_id: string }; Returns: boolean }
      leave_trip: { Args: { p_trip_id: string }; Returns: string }
      remove_trip_member: {
        Args: { p_profile_id: string; p_trip_id: string }
        Returns: string
      }
      revoke_trip_invite: { Args: { p_invite_id: string }; Returns: string }
      update_expense: {
        Args: {
          p_amount: number
          p_amounts?: number[]
          p_description: string
          p_expense_id: string
          p_member_ids: string[]
          p_payer_id: string
          p_split: Database["public"]["Enums"]["expense_split"]
        }
        Returns: string
      }
      update_trip: {
        Args: {
          p_description?: string
          p_end_date?: string
          p_name: string
          p_start_date?: string
          p_trip_id: string
        }
        Returns: string
      }
    }
    Enums: {
      expense_split: "equal" | "exact"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      expense_split: ["equal", "exact"],
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
