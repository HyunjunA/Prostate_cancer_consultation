/**
 * 사용자 행동 추적을 위한 타입 정의
 * PHI (Protected Health Information)는 절대 포함하지 않음
 */

// 추적 이벤트 타입
export type TrackingEventType =
  | "page_view"
  | "component_view"
  | "button_click"
  | "navigation"
  | "scroll_depth"
  | "time_on_component"
  | "session_start"
  | "session_end"
  | "cursor_proximity" // NEW: 커서 근접도 추적
  | "cursor_proximity_leave"; // NEW: 커서 떠남 추적

// 기본 이벤트 속성 (PHI 제외)
export interface BaseEventProperties {
  timestamp: string;
  sessionId: string;
  pageUrl?: string;
  component?: string;
  action?: string;
}

// 클릭 이벤트 속성
export interface ClickEventProperties extends BaseEventProperties {
  elementType: string;
  elementId?: string;
  elementText?: string;
  clickSequence: number;
}

// 스크롤 깊이 이벤트
export interface ScrollDepthEventProperties extends BaseEventProperties {
  scrollDepth: number; // 0-100%
  maxScrollDepth: number;
  scrollDirection: "down" | "up";
}

// 체류시간 이벤트
export interface TimeOnComponentEventProperties extends BaseEventProperties {
  duration: number; // 밀리초
  componentName: string;
  engaged: boolean; // 실제 인터랙션이 있었는지
}

// 화면 노출 이벤트
export interface ViewportEventProperties extends BaseEventProperties {
  componentName: string;
  visibilityPercentage: number;
  viewDuration: number; // 밀리초
  wasFullyVisible: boolean;
}

// 탐색 경로 이벤트
export interface NavigationEventProperties extends BaseEventProperties {
  from: string;
  to: string;
  navigationStep: number;
}

// 커서 근접도 이벤트 (NEW)
export interface CursorProximityEventProperties extends BaseEventProperties {
  componentName: string;
  distance: number; // 픽셀 단위 거리
  proximityLevel: "near" | "medium" | "far" | "very-close";
  cursorX: number;
  cursorY: number;
  componentCenter: { x: number; y: number };
  hoverDuration?: number; // 근처에 머문 시간 (밀리초)
}

// 세션 정보
export interface SessionInfo {
  sessionId: string;
  startTime: string;
  deviceType: "desktop" | "tablet" | "mobile";
  userAgent: string;
}

// 추적 설정
export interface TrackingConfig {
  enabled: boolean;
  debug: boolean;
  apiKey?: string;
  apiHost?: string;
  sessionDuration: number; // 세션 만료 시간 (밀리초)
  scrollThreshold: number; // 스크롤 추적 임계값 (%)
  visibilityThreshold: number; // 노출 추적 임계값 (%)
}

// 추적 컨텍스트
export interface TrackingContext {
  isEnabled: boolean;
  config: TrackingConfig;
  sessionInfo: SessionInfo | null;
  clickSequence: number;
  navigationStep: number;
}
