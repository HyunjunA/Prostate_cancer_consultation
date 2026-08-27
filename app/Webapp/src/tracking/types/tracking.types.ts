/**
 * Type definitions for user behavior tracking
 * PHI (Protected Health Information) is never included
 */

// Tracking event types
export type TrackingEventType =
  | "page_view"
  | "component_view"
  | "button_click"
  | "navigation"
  | "scroll_depth"
  | "time_on_component"
  | "session_start"
  | "session_end"
  | "cursor_proximity" // NEW: cursor proximity tracking
  | "cursor_proximity_leave"; // NEW: cursor-left tracking

// Base event properties (PHI excluded)
export interface BaseEventProperties {
  timestamp: string;
  sessionId: string;
  pageUrl?: string;
  component?: string;
  action?: string;
}

// Click event properties
export interface ClickEventProperties extends BaseEventProperties {
  elementType: string;
  elementId?: string;
  elementText?: string;
  clickSequence: number;
}

// Scroll depth event
export interface ScrollDepthEventProperties extends BaseEventProperties {
  scrollDepth: number; // 0-100%
  maxScrollDepth: number;
  scrollDirection: "down" | "up";
}

// Dwell time event
export interface TimeOnComponentEventProperties extends BaseEventProperties {
  duration: number; // milliseconds
  componentName: string;
  engaged: boolean; // whether the user actually interacted
}

// Viewport exposure event
export interface ViewportEventProperties extends BaseEventProperties {
  componentName: string;
  visibilityPercentage: number;
  viewDuration: number; // milliseconds
  wasFullyVisible: boolean;
}

// Navigation path event
export interface NavigationEventProperties extends BaseEventProperties {
  from: string;
  to: string;
  navigationStep: number;
}

// Cursor proximity event (NEW)
export interface CursorProximityEventProperties extends BaseEventProperties {
  componentName: string;
  distance: number; // distance in pixels
  proximityLevel: "near" | "medium" | "far" | "very-close";
  cursorX: number;
  cursorY: number;
  componentCenter: { x: number; y: number };
  hoverDuration?: number; // time spent nearby (milliseconds)
}

// Session info
export interface SessionInfo {
  sessionId: string;
  startTime: string;
  deviceType: "desktop" | "tablet" | "mobile";
  userAgent: string;
}

// Tracking configuration
export interface TrackingConfig {
  enabled: boolean;
  debug: boolean;
  apiKey?: string;
  apiHost?: string;
  sessionDuration: number; // session expiry (milliseconds)
  scrollThreshold: number; // scroll tracking threshold (%)
  visibilityThreshold: number; // visibility tracking threshold (%)
}

// Tracking context
export interface TrackingContext {
  isEnabled: boolean;
  config: TrackingConfig;
  sessionInfo: SessionInfo | null;
  clickSequence: number;
  navigationStep: number;
}
