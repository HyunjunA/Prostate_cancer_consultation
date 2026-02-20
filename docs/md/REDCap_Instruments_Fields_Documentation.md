# REDCap Survey Fields Documentation

## Overview

This document provides a detailed description of each target instrument in the R01_NLP_RiskFeedback_REDCap_Project, including the corresponding REDCap fields and their associated questions.
This document provides detailed information about the target survey instruments in the REDCap project.

| Instrument                   | REDCap Name                  | Field Count |
| ---------------------------- | ---------------------------- | ----------- |
| Decisional Conflict Survey   | `decisional_conflict_survey` | 16          |
| Shared Decision Making (SDM) | `shared_decision_making_sdm` | 4           |
| Post Risk Perception         | `risk_perception`            | 5           |
| Patient Satisfaction         | `patient_satisfaction`       | 1           |

---

## 1. Decisional Conflict Survey (DCS)

**Instrument Name:** `decisional_conflict_survey`  
**Field Count:** 16  
**Response Scale:** 5-point Likert Scale

### Response Options (Same for All Questions)

| Value | Label                      |
| ----- | -------------------------- |
| 1     | Strongly Agree             |
| 2     | Agree                      |
| 3     | Neither Agree nor Disagree |
| 4     | Disagree                   |
| 5     | Strongly Disagree          |

### Question Details

| #   | REDCap Field | Question                                                                                         |
| --- | ------------ | ------------------------------------------------------------------------------------------------ |
| Q1  | `dcs1_v2`    | I know which options are available to me.                                                        |
| Q2  | `dcs2_v2`    | I know the benefits of each option.                                                              |
| Q3  | `dcs3_v2`    | I know the risks and side effects of each option.                                                |
| Q4  | `dcs4_v2`    | I am clear about which benefits matter most to me.                                               |
| Q5  | `dcs5_v2`    | I am clear about which risks and side effects matter most to me.                                 |
| Q6  | `dcs6_v2`    | I am clear about which is more important to me (the benefits or the risks and the side effects). |
| Q7  | `dcs7_v2`    | I have enough support from others to make a choice.                                              |
| Q8  | `dcs8_v2`    | I am choosing without pressure from others.                                                      |
| Q9  | `dcs9_v2`    | I have enough advice to make a choice.                                                           |
| Q10 | `dcs10_v2`   | I am clear about the best choice for me.                                                         |
| Q11 | `dcs11_v2`   | I feel sure about what to choose.                                                                |
| Q12 | `dcs12_v2`   | This decision is easy for me to make.                                                            |
| Q13 | `dcs13_v2`   | I feel I have made an informed choice.                                                           |
| Q14 | `dcs14_v2`   | My decision shows what is important to me.                                                       |
| Q15 | `dcs15_v2`   | I expect to stick with my decision.                                                              |
| Q16 | `dcs16_v2`   | I am satisfied with my decision.                                                                 |

---

## 2. Shared Decision Making (SDM)

**Instrument Name:** `shared_decision_making_sdm`  
**Field Count:** 4

### Question Details

| #   | REDCap Field   | Type  | Question                                                                                                                                                                              | Response Options                          |
| --- | -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Q1  | `sdmp_options` | yesno | Did the health care provider explain there were choices in what you could do to treat your condition? OR Did the health care provider talk about [intervention] as an option for you? | 1=Yes, 0=No                               |
| Q2  | `sdm_ptos`     | radio | How much did you and the health care provider talk about the reasons you might want to have [intervention]?                                                                           | 1=A lot, 2=Some, 3=A little, 4=Not at all |
| Q3  | `sdm_cons`     | radio | How much did you and the health care provider talk about the reasons you might not want to have [intervention]?                                                                       | 1=A lot, 2=Some, 3=A little, 4=Not at all |
| Q4  | `sdm_pref`     | yesno | Did the health care provider ask you whether or not you wanted to have [intervention]?                                                                                                | 1=Yes, 0=No                               |

---

## 3. Post Risk Perception

**Instrument Name:** `risk_perception`  
**Field Count:** 5

### Question Details

#### Q1. `risk_percep_1_1`

**Question:** Which of the following is closest to the risk of your cancer if you don't treat it?

| Value | Label                                                           |
| ----- | --------------------------------------------------------------- |
| 1     | 5 out of 100 men die of cancer at your life expectancy          |
| 2     | 10 out of 100 men die of cancer at your life expectancy         |
| 3     | 20 out of 100 men die of cancer at your life expectancy         |
| 4     | 30 out of 100 men die of cancer at your life expectancy         |
| 5     | 40 or more out of 100 men die of cancer at your life expectancy |

#### Q2. `risk_percept2_2`

**Question:** Which of the following is closest to the risk of your cancer if you do treat it?

| Value | Label                                                           |
| ----- | --------------------------------------------------------------- |
| 1     | 5 out of 100 men die of cancer at your life expectancy          |
| 2     | 10 out of 100 men die of cancer at your life expectancy         |
| 3     | 20 out of 100 men die of cancer at your life expectancy         |
| 4     | 30 out of 100 men die of cancer at your life expectancy         |
| 5     | 40 or more out of 100 men die of cancer at your life expectancy |

#### Q3. `risk_percept_3_3`

**Question:** Which of the following is closest to the risk of permanent erectile dysfunction at 2 years (requiring injection therapy or penile prosthesis)?

| Value | Label             |
| ----- | ----------------- |
| 1     | 10 out of 100 men |
| 2     | 25 out of 100 men |
| 3     | 50 out of 100 men |
| 4     | 75 out of 100 men |
| 5     | 90 out of 100 men |

#### Q4. `risk_percept_4_4`

**Question:** Which of the following is closest to the risk of urinary incontinence at 1 year (requiring pads)?

| Value | Label             |
| ----- | ----------------- |
| 1     | 5 out of 100 men  |
| 2     | 10 out of 100 men |
| 3     | 20 out of 100 men |
| 4     | 30 out of 100 men |
| 5     | 50 out of 100 men |

#### Q5. `risk_percep_5_5`

**Question:** Which of the following is closest to the risk of irritative urinary symptoms at 1 year (moderate or severe problem requiring medical or surgical intervention)?

| Value | Label             |
| ----- | ----------------- |
| 1     | 5 out of 100 men  |
| 2     | 10 out of 100 men |
| 3     | 15 out of 100 men |
| 4     | 20 out of 100 men |
| 5     | 30 out of 100 men |

---

## 4. Patient Satisfaction

**Instrument Name:** `patient_satisfaction`  
**Field Count:** 1

### Question Details

| #   | REDCap Field      | Type             | Question                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `pt_satisfaction` | text (free-form) | We will assess patient satisfaction with the NLP reports using a quantitative Likert scale as well as free-form feedback. The free form feedback will directly query the understandability of reports, whether/how reports clarified the key tradeoffs to be considered, and whether/how it clarified risk of these tradeoffs. Data will be reported descriptively. |

---

## Field Mapping: Frontend → REDCap

This mapping table is used to convert data sent from the frontend in `q1`, `q2` format to REDCap field names.

### DCS (Decisional Conflict Survey)

| Frontend Key | REDCap Field |
| ------------ | ------------ |
| q1           | dcs1_v2      |
| q2           | dcs2_v2      |
| q3           | dcs3_v2      |
| q4           | dcs4_v2      |
| q5           | dcs5_v2      |
| q6           | dcs6_v2      |
| q7           | dcs7_v2      |
| q8           | dcs8_v2      |
| q9           | dcs9_v2      |
| q10          | dcs10_v2     |
| q11          | dcs11_v2     |
| q12          | dcs12_v2     |
| q13          | dcs13_v2     |
| q14          | dcs14_v2     |
| q15          | dcs15_v2     |
| q16          | dcs16_v2     |

### SDM (Shared Decision Making)

| Frontend Key | REDCap Field |
| ------------ | ------------ |
| q1           | sdmp_options |
| q2           | sdm_ptos     |
| q3           | sdm_cons     |
| q4           | sdm_pref     |

### Risk Perception

| Frontend Key | REDCap Field     |
| ------------ | ---------------- |
| q1           | risk_percep_1_1  |
| q2           | risk_percept2_2  |
| q3           | risk_percept_3_3 |
| q4           | risk_percept_4_4 |
| q5           | risk_percep_5_5  |

### Satisfaction

| Frontend Key | REDCap Field    |
| ------------ | --------------- |
| q1           | pt_satisfaction |

---

## Value Transformation Notes

### SDM Yes/No Field Transformation

When the frontend sends `"yes"/"no"` strings, they need to be converted to REDCap values:

| Frontend Value | REDCap Value |
| -------------- | ------------ |
| "yes"          | "1"          |
| "no"           | "0"          |

### DCS Value Transformation

When the frontend sends 0-4 index values, they need to be converted to REDCap 1-5 values:

| Frontend Value | REDCap Value | Label                      |
| -------------- | ------------ | -------------------------- |
| 0              | 1            | Strongly Agree             |
| 1              | 2            | Agree                      |
| 2              | 3            | Neither Agree nor Disagree |
| 3              | 4            | Disagree                   |
| 4              | 5            | Strongly Disagree          |

---

## Python Mapping Dictionary

```python
FRONTEND_TO_REDCAP_MAPPING = {
    "dcs": {
        "q1": "dcs1_v2",
        "q2": "dcs2_v2",
        "q3": "dcs3_v2",
        "q4": "dcs4_v2",
        "q5": "dcs5_v2",
        "q6": "dcs6_v2",
        "q7": "dcs7_v2",
        "q8": "dcs8_v2",
        "q9": "dcs9_v2",
        "q10": "dcs10_v2",
        "q11": "dcs11_v2",
        "q12": "dcs12_v2",
        "q13": "dcs13_v2",
        "q14": "dcs14_v2",
        "q15": "dcs15_v2",
        "q16": "dcs16_v2",
    },
    "sdm": {
        "q1": "sdmp_options",
        "q2": "sdm_ptos",
        "q3": "sdm_cons",
        "q4": "sdm_pref",
    },
    "risk_perception": {
        "q1": "risk_percep_1_1",
        "q2": "risk_percept2_2",
        "q3": "risk_percept_3_3",
        "q4": "risk_percept_4_4",
        "q5": "risk_percep_5_5",
    },
    "satisfaction": {
        "q1": "pt_satisfaction",
    },
}
```

---

## Notes

1. **REDCap Field Name Irregularities**: Risk Perception field names contain typos/inconsistencies

   - `risk_percep_1_1` (percep)
   - `risk_percept2_2` (percept, no underscore)
   - `risk_percept_3_3` (percept)
   - `risk_percept_4_4` (percept)
   - `risk_percep_5_5` (percep)

2. **Longitudinal Project**: If the project is longitudinal, the `redcap_event_name` field is required

3. **Values Must Be Strings**: REDCap API receives all values as strings (e.g., `"1"`, `"2"`)
