export const INCIDENT_SEVERITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = [
  'open',
  'acknowledged',
  'assigned',
  'investigating',
  'escalated',
  'waiting',
  'resolved',
  'closed',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_CATEGORIES = [
  'Safety Event',
  'Equipment Failure',
  'System Outage',
  'Flight Data Issue',
  'Network Failure',
  'User Access Issue',
  'Security Incident',
  'Data Integrity Issue',
  'Compliance Violation',
  'Operational Delay',
  'Infrastructure Issue',
  'Ground Support Equipment Failure',
  'Passenger Processing Issue',
  'Station Connectivity Failure',
  'Dashboard Data Failure',
  'Authentication Outage',
  'Bulk Import Failure',
  'API Failure',
  'Report Generation Failure',
  'Compliance Breach',
  'Security Access Violation',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const INCIDENT_PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;

export const DEFAULT_STATIONS = [
  'Delhi',
  'Mumbai',
  'Chennai',
  'Kochi',
  'Agra',
  'Chandigarh',
] as const;
