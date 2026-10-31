export type OfferingType = 'event_place_with_rooms' | 'event_place_only' | 'room_only' | 'amenity';

/** Key of a row in request_statuses. */
export type RequestStatus = string;

export type StatusCategory = 'new' | 'booked' | 'closed';

export interface StatusDef {
  key: string;
  label: string;
  bg: string;
  text_color: string;
  category: StatusCategory;
  sort_order: number;
  is_default: boolean;
  usage_count?: number;
}

export interface StatusInput {
  label: string;
  bg: string;
  text_color: string;
  category: StatusCategory;
  is_default: boolean;
}

export interface Offering {
  id: number;
  name: string;
  type: OfferingType;
  description: string | null;
  capacity: number | null;
  price: number | null;
  price_unit: string | null;
  quantity: number;
  is_active: boolean;
  usage_count?: number;
  created_at: string;
  updated_at: string;
}

export type OfferingInput = Omit<Offering, 'id' | 'usage_count' | 'created_at' | 'updated_at'>;

export interface BookingRequest {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
  offering_id: number | null;
  offering_name: string | null;
  offering_type: OfferingType | null;
  start_date: string;
  end_date: string;
  guests: number | null;
  event_type: string | null;
  message: string | null;
  status: RequestStatus;
  admin_notes: string | null;
  source: string;
  amenities: { id: number; name: string }[];
  created_at: string;
  updated_at: string;
}

export interface BookingRequestInput {
  full_name: string;
  email: string;
  phone: string | null;
  offering_id: number | null;
  start_date: string;
  end_date: string;
  guests: number | null;
  event_type: string | null;
  message: string | null;
  status: RequestStatus;
  admin_notes: string | null;
  amenity_ids: number[];
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Admin {
  id: number;
  name: string;
  email: string;
  created_at?: string;
}

export interface Stats {
  pending: number;
  confirmed_this_month: number;
  upcoming_week: number;
  active_offerings: number;
  pending_requests: BookingRequest[];
  upcoming_requests: BookingRequest[];
  pipeline?: {
    open: number;
    confirmed: number;
    conversion_rate: number | null;
  };
}

export type Pipeline = 'event_venue' | 'room_booking';
export type LeadSource = 'website' | 'facebook' | 'instagram' | 'social_media' | 'referral' | 'walk_in' | 'other';
export type StageOutcome = 'open' | 'won' | 'lost';
export type VisitStatus = 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';

export interface AgentRef {
  id: number;
  name: string;
}

export interface Agent {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface PipelineStage {
  id: number;
  pipeline: Pipeline;
  label: string;
  bg: string;
  text_color: string;
  sort_order: number;
  outcome: StageOutcome;
  reserves_inventory: boolean;
  usage_count: number;
}

export interface InquiryActivity {
  id: number;
  kind: string;
  summary: string;
  created_at: string;
  admin_id: number | null;
  admin_name: string | null;
}

export interface SiteVisit {
  id: number;
  scheduled_at: string;
  status: VisitStatus;
  notes: string | null;
  outcome: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface PriceEvent {
  id: number;
  package_price: number;
  additional_charges: number;
  discounts: number;
  other_fees: number;
  total_quoted: number;
  final_agreed_price: number | null;
  created_at: string;
  admin_id: number | null;
}

export interface StageEvent {
  id: number;
  stage_id: number | null;
  stage_label: string;
  entered_at: string;
  admin_id: number | null;
  admin_name: string | null;
}

export interface Inquiry {
  id: number;
  /** Set when this card is a confirmed booking request shown on the won stage. */
  booking_request_id?: number | null;
  pipeline: Pipeline;
  stage_id: number;
  stage_label: string;
  stage_bg: string;
  stage_text_color: string;
  stage_outcome: StageOutcome;
  reserves_inventory: boolean;
  customer_name: string;
  phone: string | null;
  email: string;
  lead_source: LeadSource;
  lead_source_detail: string | null;
  offering_id: number | null;
  offering_name: string | null;
  offering_type: OfferingType | null;
  event_type: string | null;
  guests: number | null;
  start_at: string | null;
  end_at: string | null;
  special_requests: string | null;
  additional_services: string | null;
  custom_arrangements: string | null;
  internal_notes: string | null;
  package_price: number;
  additional_charges: number;
  discounts: number;
  other_fees: number;
  total_quoted: number;
  final_agreed_price: number | null;
  deposit_amount: number | null;
  deposit_note: string | null;
  converted_at: string | null;
  stage_entered_at: string;
  created_at: string;
  updated_at: string;
  seconds_in_stage: number;
  seconds_since_created: number;
  created_by: number | null;
  created_by_name: string | null;
  agents: AgentRef[];
  activities?: InquiryActivity[];
  visits?: SiteVisit[];
  price_events?: PriceEvent[];
  stage_events?: StageEvent[];
}

export interface InquiryInput {
  pipeline: Pipeline;
  stage_id?: number;
  customer_name: string;
  phone: string | null;
  email: string;
  lead_source: LeadSource;
  lead_source_detail: string | null;
  offering_id: number | null;
  event_type: string | null;
  guests: number | null;
  start_at: string | null;
  end_at: string | null;
  special_requests: string | null;
  additional_services: string | null;
  custom_arrangements: string | null;
  internal_notes: string | null;
  package_price: number;
  additional_charges: number;
  discounts: number;
  other_fees: number;
  final_agreed_price: number | null;
  deposit_amount: number | null;
  deposit_note: string | null;
  agent_ids: number[];
  updated_at?: string;
}

export interface ConversionGroup {
  key: string;
  label: string;
  eligible: number;
  converted: number;
  conversion_rate: number | null;
  average_seconds: number | null;
  open: number;
  confirmed: number;
  lost: number;
}

export interface PipelineAnalytics {
  period: { from: string | null; to: string | null };
  definition: string;
  pipeline: Pipeline | null;
  summary: {
    total: number;
    open: number;
    confirmed: number;
    lost: number;
    eligible: number;
    converted: number;
    conversion_rate: number | null;
    average_seconds: number | null;
  };
  by_stage: {
    id: number;
    pipeline: Pipeline;
    label: string;
    outcome: StageOutcome;
    sort_order: number;
    bg: string;
    text_color: string;
    total: number;
  }[];
  stage_time: { key: string; label: string; average_seconds: number; visits: number }[];
  by_agent: ConversionGroup[];
  by_source: ConversionGroup[];
  by_pipeline: ConversionGroup[];
}
