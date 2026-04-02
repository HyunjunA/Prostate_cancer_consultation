/**
 * components/surveys/index.ts
 *
 * Export all survey components for easy importing
 */

// SDM Components
export {
  YesNoQuestion,
  ScaleQuestion,
  SDMSurvey,
  SDM_QUESTIONS,
  INITIAL_SDM_ANSWERS,
  type YesNoAnswer,
  type ScaleAnswer,
  type SDMAnswers,
} from "./SDMQuestions";

// Baseline Components
export {
  BaselineRadioGroup,
  BaselineCheckboxGroup,
  BaselineTextInput,
  BASELINE_OPTIONS,
  type SexAtBirthAnswer,
  type EducationAnswer,
  type MaritalStatusAnswer,
  type BaselineAnswers,
} from "./BaselineQuestions";

export {
  DecisionalConflictSurvey,
  LikertQuestion,
  QuestionSection,
  DCS_QUESTIONS,
  DCS_SECTIONS,
  DCS_SUBSCALES,
  LIKERT_OPTIONS,
  INITIAL_DCS_ANSWERS,
  calculateDCSScore,
  type LikertAnswer,
  type DecisionalConflictAnswers,
} from "./DecisionalConflictSurvey";

// Risk Perception Survey
export {
  RiskPerceptionSurvey,
  RiskQuestion,
  RiskSliderQuestion,
  RISK_QUESTIONS,
  INITIAL_RISK_ANSWERS,
  type RiskPerceptionAnswers,
} from "./RiskPerceptionSurvey";

// Patient Satisfaction Survey
export {
  PatientSatisfactionSurvey,
  FeedbackTextInput,
  SATISFACTION_QUESTION_TEXT,
  INITIAL_SATISFACTION_ANSWERS,
  type PatientSatisfactionAnswers,
} from "./PatientSatisfactionSurvey";
