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
  public: {
    Tables: {
      ai_practice_questions: {
        Row: {
          correct_answer: string
          created_at: string
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          explanation: string | null
          id: string
          is_correct: boolean | null
          marks_obtained: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question: string
          question_order: number
          selected_answer: string | null
          session_id: string
          topic: string | null
        }
        Insert: {
          correct_answer: string
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          explanation?: string | null
          id?: string
          is_correct?: boolean | null
          marks_obtained?: number
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question: string
          question_order?: number
          selected_answer?: string | null
          session_id: string
          topic?: string | null
        }
        Update: {
          correct_answer?: string
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          explanation?: string | null
          id?: string
          is_correct?: boolean | null
          marks_obtained?: number
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question?: string
          question_order?: number
          selected_answer?: string | null
          session_id?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_practice_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_practice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_practice_sessions: {
        Row: {
          accuracy: number
          completed_at: string | null
          correct_answers: number
          created_at: string
          id: string
          score: number
          status: Database["public"]["Enums"]["practice_status"]
          topic: string | null
          total_questions: number
          unanswered: number
          user_id: string
          wrong_answers: number
        }
        Insert: {
          accuracy?: number
          completed_at?: string | null
          correct_answers?: number
          created_at?: string
          id?: string
          score?: number
          status?: Database["public"]["Enums"]["practice_status"]
          topic?: string | null
          total_questions?: number
          unanswered?: number
          user_id: string
          wrong_answers?: number
        }
        Update: {
          accuracy?: number
          completed_at?: string | null
          correct_answers?: number
          created_at?: string
          id?: string
          score?: number
          status?: Database["public"]["Enums"]["practice_status"]
          topic?: string | null
          total_questions?: number
          unanswered?: number
          user_id?: string
          wrong_answers?: number
        }
        Relationships: []
      }
      answers: {
        Row: {
          attempt_id: string
          created_at: string
          id: string
          is_correct: boolean | null
          marks_obtained: number
          question_id: string
          selected_answer: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          marks_obtained?: number
          question_id: string
          selected_answer?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean | null
          marks_obtained?: number
          question_id?: string
          selected_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          deadline: string | null
          exam_id: string
          id: string
          mandatory: boolean
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          deadline?: string | null
          exam_id: string
          id?: string
          mandatory?: boolean
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          deadline?: string | null
          exam_id?: string
          id?: string
          mandatory?: boolean
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_assignments_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          correct_answers: number
          created_at: string
          exam_id: string
          id: string
          score: number
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          submitted_at: string | null
          total_questions: number
          unanswered: number
          user_id: string
          wrong_answers: number
        }
        Insert: {
          correct_answers?: number
          created_at?: string
          exam_id: string
          id?: string
          score?: number
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          total_questions?: number
          unanswered?: number
          user_id: string
          wrong_answers?: number
        }
        Update: {
          correct_answers?: number
          created_at?: string
          exam_id?: string
          id?: string
          score?: number
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          submitted_at?: string | null
          total_questions?: number
          unanswered?: number
          user_id?: string
          wrong_answers?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sections: {
        Row: {
          created_at: string
          exam_id: string
          id: string
          marks_per_question: number
          negative_mark: number
          pdf_document_id: string | null
          section_name: string
          section_order: number
          source_end_page: number | null
          source_start_page: number | null
          summary: string | null
          topics: Json | null
        }
        Insert: {
          created_at?: string
          exam_id: string
          id?: string
          marks_per_question?: number
          negative_mark?: number
          pdf_document_id?: string | null
          section_name: string
          section_order?: number
          source_end_page?: number | null
          source_start_page?: number | null
          summary?: string | null
          topics?: Json | null
        }
        Update: {
          created_at?: string
          exam_id?: string
          id?: string
          marks_per_question?: number
          negative_mark?: number
          pdf_document_id?: string | null
          section_name?: string
          section_order?: number
          source_end_page?: number | null
          source_start_page?: number | null
          summary?: string | null
          topics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_sections_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_sections_pdf_document_id_fkey"
            columns: ["pdf_document_id"]
            isOneToOne: false
            referencedRelation: "pdf_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          cadet_category: Database["public"]["Enums"]["cadet_category"]
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number
          id: string
          marks_per_question: number
          negative_mark: number
          published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          cadet_category: Database["public"]["Enums"]["cadet_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          marks_per_question?: number
          negative_mark?: number
          published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          cadet_category?: Database["public"]["Enums"]["cadet_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          id?: string
          marks_per_question?: number
          negative_mark?: number
          published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      high_frequency_concepts: {
        Row: {
          concept: string
          created_at: string
          exam_id: string | null
          id: string
          occurrence_count: number
          pages: Json | null
          pdf_document_id: string | null
          priority: Database["public"]["Enums"]["concept_priority"]
          sections: Json | null
          source_document: string | null
        }
        Insert: {
          concept: string
          created_at?: string
          exam_id?: string | null
          id?: string
          occurrence_count?: number
          pages?: Json | null
          pdf_document_id?: string | null
          priority?: Database["public"]["Enums"]["concept_priority"]
          sections?: Json | null
          source_document?: string | null
        }
        Update: {
          concept?: string
          created_at?: string
          exam_id?: string | null
          id?: string
          occurrence_count?: number
          pages?: Json | null
          pdf_document_id?: string | null
          priority?: Database["public"]["Enums"]["concept_priority"]
          sections?: Json | null
          source_document?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "high_frequency_concepts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "high_frequency_concepts_pdf_document_id_fkey"
            columns: ["pdf_document_id"]
            isOneToOne: false
            referencedRelation: "pdf_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      location_events: {
        Row: {
          accuracy: number | null
          attempt_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["location_event_type"]
          exam_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          attempt_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["location_event_type"]
          exam_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          user_id: string
        }
        Update: {
          accuracy?: number | null
          attempt_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["location_event_type"]
          exam_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_events_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          notification_type: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          notification_type?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      pdf_documents: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          exam_id: string | null
          failed_pages: number
          file_name: string
          file_size: number
          id: string
          processed_pages: number
          status: Database["public"]["Enums"]["pdf_status"]
          storage_path: string | null
          total_pages: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          exam_id?: string | null
          failed_pages?: number
          file_name: string
          file_size?: number
          id?: string
          processed_pages?: number
          status?: Database["public"]["Enums"]["pdf_status"]
          storage_path?: string | null
          total_pages?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          exam_id?: string | null
          failed_pages?: number
          file_name?: string
          file_size?: number
          id?: string
          processed_pages?: number
          status?: Database["public"]["Enums"]["pdf_status"]
          storage_path?: string | null
          total_pages?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_documents_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cadet_category: Database["public"]["Enums"]["cadet_category"] | null
          created_at: string
          email: string
          exam_participant: boolean
          exam_required: boolean
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          cadet_category?: Database["public"]["Enums"]["cadet_category"] | null
          created_at?: string
          email: string
          exam_participant?: boolean
          exam_required?: boolean
          id: string
          name?: string
          updated_at?: string
        }
        Update: {
          cadet_category?: Database["public"]["Enums"]["cadet_category"] | null
          created_at?: string
          email?: string
          exam_participant?: boolean
          exam_required?: boolean
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          correct_answer: string
          created_at: string
          created_by: string | null
          difficulty: Database["public"]["Enums"]["difficulty_level"]
          exam_id: string | null
          explanation: string | null
          id: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          repetition_count: number
          repetition_evidence: Json | null
          repetition_priority:
            | Database["public"]["Enums"]["concept_priority"]
            | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          section_id: string | null
          source_page: number | null
          source_section: string | null
          source_type: Database["public"]["Enums"]["question_source_type"]
          subject: string | null
          subject_id: string | null
          topic: string | null
          updated_at: string
        }
        Insert: {
          correct_answer: string
          created_at?: string
          created_by?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          exam_id?: string | null
          explanation?: string | null
          id?: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_text: string
          repetition_count?: number
          repetition_evidence?: Json | null
          repetition_priority?:
            | Database["public"]["Enums"]["concept_priority"]
            | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id?: string | null
          source_page?: number | null
          source_section?: string | null
          source_type?: Database["public"]["Enums"]["question_source_type"]
          subject?: string | null
          subject_id?: string | null
          topic?: string | null
          updated_at?: string
        }
        Update: {
          correct_answer?: string
          created_at?: string
          created_by?: string | null
          difficulty?: Database["public"]["Enums"]["difficulty_level"]
          exam_id?: string | null
          explanation?: string | null
          id?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_text?: string
          repetition_count?: number
          repetition_evidence?: Json | null
          repetition_priority?:
            | Database["public"]["Enums"]["concept_priority"]
            | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          section_id?: string | null
          source_page?: number | null
          source_section?: string | null
          source_type?: Database["public"]["Enums"]["question_source_type"]
          subject?: string | null
          subject_id?: string | null
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "exam_sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          approved: boolean
          confidence: number
          created_at: string
          created_by: string | null
          description: string | null
          end_page: number | null
          exam_id: string | null
          id: string
          name: string
          page_count: number
          pdf_document_id: string | null
          start_page: number | null
          subject_order: number
          topics: Json
          updated_at: string
        }
        Insert: {
          approved?: boolean
          confidence?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_page?: number | null
          exam_id?: string | null
          id?: string
          name: string
          page_count?: number
          pdf_document_id?: string | null
          start_page?: number | null
          subject_order?: number
          topics?: Json
          updated_at?: string
        }
        Update: {
          approved?: boolean
          confidence?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_page?: number | null
          exam_id?: string | null
          id?: string
          name?: string
          page_count?: number
          pdf_document_id?: string | null
          start_page?: number | null
          subject_order?: number
          topics?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_pdf_document_id_fkey"
            columns: ["pdf_document_id"]
            isOneToOne: false
            referencedRelation: "pdf_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "MAIN_ADMIN" | "ADMIN" | "CADET"
      assignment_status: "assigned" | "started" | "completed" | "expired"
      attempt_status: "in_progress" | "completed" | "expired"
      cadet_category: "NCC B" | "NCC C"
      concept_priority: "VERY_HIGH" | "HIGH" | "NORMAL" | "LOW"
      difficulty_level: "Easy" | "Medium" | "Hard"
      location_event_type: "LOGIN" | "EXAM_START" | "EXAM_SUBMIT"
      pdf_status:
        | "UPLOADED"
        | "EXTRACTING"
        | "ANALYZING"
        | "GENERATING"
        | "REVIEW"
        | "COMPLETED"
        | "FAILED"
      practice_status: "in_progress" | "completed" | "abandoned"
      question_source_type: "MANUAL" | "PDF_EXISTING_QUESTION" | "AI_GENERATED"
      review_status: "PENDING" | "APPROVED" | "REJECTED"
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
  public: {
    Enums: {
      app_role: ["MAIN_ADMIN", "ADMIN", "CADET"],
      assignment_status: ["assigned", "started", "completed", "expired"],
      attempt_status: ["in_progress", "completed", "expired"],
      cadet_category: ["NCC B", "NCC C"],
      concept_priority: ["VERY_HIGH", "HIGH", "NORMAL", "LOW"],
      difficulty_level: ["Easy", "Medium", "Hard"],
      location_event_type: ["LOGIN", "EXAM_START", "EXAM_SUBMIT"],
      pdf_status: [
        "UPLOADED",
        "EXTRACTING",
        "ANALYZING",
        "GENERATING",
        "REVIEW",
        "COMPLETED",
        "FAILED",
      ],
      practice_status: ["in_progress", "completed", "abandoned"],
      question_source_type: ["MANUAL", "PDF_EXISTING_QUESTION", "AI_GENERATED"],
      review_status: ["PENDING", "APPROVED", "REJECTED"],
    },
  },
} as const
