export interface RemovalRequestRow {
  id: number;
  broker_id: string;
  method: string;
  status: string;
  template_used: string;
  email_sent_to: string | null;
  confidence_score: number | null;
  attempt_count: number;
  last_error: string | null;
  screenshot_path: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrokerResponseRow {
  id: number;
  request_id: number;
  response_type: string;
  raw_subject: string | null;
  raw_from: string | null;
  raw_body_hash: string;
  confirmation_url: string | null;
  url_domain: string | null;
  is_processed: number;
  created_at: string;
}

export interface PendingTaskRow {
  id: number;
  request_id: number;
  task_type: string;
  description: string;
  url: string | null;
  is_completed: number;
  created_at: string;
  completed_at: string | null;
}

export interface EmailLogRow {
  id: number;
  request_id: number;
  direction: string;
  message_id: string | null;
  from_addr: string;
  to_addr: string;
  subject: string;
  status: string;
  created_at: string;
}

export interface CircuitBreakerRow {
  broker_id: string;
  state: string;
  failure_count: number;
  last_failure_at: string | null;
  cooldown_until: string | null;
  domain: string | null;
  updated_at: string;
}

export interface DomainCircuitBreakerRow {
  domain: string;
  state: string;
  failure_count: number;
  consecutive_opens: number;
  last_failure_at: string | null;
  cooldown_until: string | null;
  updated_at: string;
}

export interface PipelineRunRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  total_brokers: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
}

export interface ScanRunRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  total_brokers: number;
  found_count: number;
  not_found_count: number;
  error_count: number;
}

export interface ScanResultRow {
  id: number;
  scan_run_id: number;
  broker_id: string;
  found: number;
  confidence: number | null;
  profile_data: string | null;
  screenshot_path: string | null;
  page_text: string | null;
  error: string | null;
  created_at: string;
}

export interface RescanScheduleRow {
  broker_id: string;
  next_rescan_at: string;
  interval_days: number;
  last_rescan_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EvidenceChainRow {
  id: number;
  request_id: number | null;
  scan_result_id: number | null;
  entry_type: string;
  content_hash: string;
  prev_hash: string;
  screenshot_path: string | null;
  page_text: string | null;
  page_text_hash: string | null;
  broker_url: string | null;
  broker_id: string;
  metadata: string | null;
  created_at: string;
}
