# NLP Sentence Classification Pipeline -- Final Consolidated Specification

> **Sources:** Meeting Transcript Spec (v2.1) + Jun's Implementation Spec (v1)
> **Author:** Jun (implementation), Ivan/Gideon (requirements)
> **Purpose:** Replicate Michael's R (+HTML comments)-based NLP pipeline **identically in Python**
> so that sample input -> intermediate outputs -> final output **match exactly** (or reflect only agreed-upon changes).

---

## 0. Summary of Core Requirements (5 Points Repeated in Discussion)

1. **Correct the definitions of pre-processing and post-processing**
   - Pre-processing: sentence segmentation / filtering / cleanup
   - Post-processing: Top-N selection + context expansion + index assignment + output formatting

2. **Exact Match is the top priority**
   - "Even a minor change to the sentence structure that the downstream classifier was trained on can invalidate the entire pipeline."

3. **Maintain indices (index, i, i2)**
   - Initially there was an opinion that "index alone would suffice," but ultimately all three indices are retained.
   - Reason: keep them identical to the original development to prevent surprises + enable debugging

4. **Finalized as Top-10 (per domain) rule**
   - The code contained `prob > 0.7` (from past experiments), but the final agreement is "top 10 sentences by pred1 probability per domain."

5. **Support for new input format (TurboScribe)**
   - Keystroke (old format): clear labels like interviewer/patient
   - TurboScribe (new format): uses speaker1/speaker2, etc.
   - Therefore, doctor identification uses "total text length" rather than relying on the name.

---

## 1. Objective

This pipeline must:

1. Identify the doctor speaker automatically (by total text length).
2. Perform sentence segmentation (identical to R `tidytext::unnest_tokens`).
3. Generate indices (`i`, `i2`, `index`) identical in structure to the R implementation.
4. Classify each sentence using the trained model (5 domains via Docker API).
5. Select Top 10 sentences per outcome (replacing >0.70 threshold logic).
6. Extract +/-3 sentence contextual windows using `index`.
7. Export intermediate and final outputs for validation.

---

## 2. Non-negotiable Principles

### 2.1 Exact Match

- Results must not be "similar." When compared against samples, the following must be identical:
  - (1) Sentence segmentation results: sentence count / boundaries / text (including whitespace)
  - (2) Indices: index/i/i2 values and basis (including 0/1-based)
  - (3) Classification result format: pred0/pred1 column structure per domain
  - (4) Top-10 selection results
  - (5) +/-3 context expansion results
  - (6) Final CSV: row count / sort order / column order / values

> **Discussion reference:** "minimum change can... downstream classifier's trained structure changes and becomes invalid"
> "compare and outputs are exactly the same"

### 2.2 Architecture Separation

- **Do not couple** with DB / GUI / REDCap / other systems. The pipeline is an **independent unit**.
- No spaghetti code. Modular + maintainable structure.

> **Discussion reference:** "This pipeline has nothing to do with the database... GUIs, Redcaps... this is a unit."
> "super clean... not messy code... maintainable... comment it."

### 2.3 Code Quality

- No "just make it work" approach. Build it cleanly as a pipeline from the start.
- At minimum, include comments for each key step.

> **Discussion reference:** "Don't do it like try it and see if it works... build it pipeline way from beginning"

### 2.4 R Logic -- No Guessing

- If the meaning of R code constructs like `group_by`, `mutate`, `ungroup` is ambiguous, **ask immediately**.

> **Discussion reference:** "If you have a doubt... ask us. We have limited time."
> "Don't go by 'I think...' ask us."

### 2.5 Sample-Based Development

- Implementation is based on **sample input/output comparison**, not "assumption-based development."

> **Discussion reference:** "from the first file... to segmented file... to final output... compare exactly same"

---

## 3. Required Resources (4 Items)

1. **Keystroke input CSV** (e.g., `Rec_001_SIT_14...`)
   - Each row represents a "turn/segment," not a sentence

2. **Michael's HTML file**
   - Contains R code + comments + algorithm explanation

3. **Michael's final output CSV**
   - e.g., `NLP ... process results`

4. **TurboScribe input CSV sample**
   - New format with speaker1/speaker2, etc.

> **Discussion reference:** "I can send you three things... input, html, output"

---

## 4. Configuration Specification (No Hardcoding)

Required configuration keys:

| Key | Description | Default |
|-----|-------------|---------|
| `input_path` | Input folder path | -- |
| `output_path` | Output folder path | -- |
| `archive_path` | Path for processed files | -- |
| `error_path` | Path for failed files | -- |
| `text_column_name` | Text column name | `text` |
| `speaker_column_name` | Speaker column name | `speaker` |
| `file_pattern` | Input file pattern | `*.xlsx` |
| `poll_interval_sec` | File watch interval | `5` |
| `sid_column_name` | SID column name (if present) | -- |
| `model_path_or_uri` | NLP Docker API URL | `http://nlp-classifiers:8000` |
| `outcomes` | Classification domain list | `[cp, le, ed, inc, ius]` |
| `top_k` | Sentences selected per domain | `10` |
| `context_window` | Context expansion range | `3` |

> **Discussion reference:** "put it in a config file... don't hard-code it... columns might change"
> "you only care about speaker column and text column"

---

## 5. Module Architecture

### 5.1 Main Pipeline

- Load configuration
- Start FileManager
- On file detection -> call SentenceClassificationModule
- Handle success/failure and archive accordingly

### 5.2 FileManager

Responsibilities:

- Monitor `input_path`
- Detect new CSV/XLSX files
- Ensure file stability before processing
- Move processed files to `archive_path`
- Move failed files to `error_path`

> **Discussion reference:** "you have a worker... looking for a file... grabs the file... preprocess... call Docker... stitch output"

### 5.3 SentenceClassificationModule

Responsible for:

1. Doctor identification (Step 1)
2. Sentence segmentation (Step 2)
3. Index creation (Step 2)
4. Model inference (Step 3)
5. Top-10 selection per outcome (Step 4)
6. Context extraction (Step 5)
7. Output export (Step 6)

### 5.4 Recommended Directory Structure

```
app/Pipeline/
├── config.yaml
├── config.py
├── main_pipeline.py           # Entry / CLI
├── file_manager.py            # File watcher + archive/error
├── sentence_classification/
│   ├── __init__.py
│   ├── preprocessing.py       # Step 1: Doctor identification + filtering
│   ├── segmentation.py        # Step 2: Sentence segmentation + indexing
│   ├── classification.py      # Step 3: NLP Docker model calls
│   ├── selection.py           # Step 4: Top-10 selection
│   ├── context.py             # Step 5: ±3 context extraction
│   └── export.py              # Step 6: Intermediate + final output
├── state.py                   # Pipeline state (sentence order/index)
├── requirements.txt
└── tests/
```

> **Discussion reference:** "create a module... sentence classification... main pipeline... worker... configurable"

---

## 6. Algorithm Specification

### Step 1: Doctor Identification (Name-Based Identification Prohibited)

- Group by speaker
- Concatenate all text per speaker
- Compute total text length
- Longest aggregated text = doctor
- Aggregation used ONLY for identification (original row structure is preserved)
- Keep only doctor speaker rows and remove the rest

> **Discussion reference:** "Don't go by doctor. Go by frequency..."
> Followed by correction: "not frequency of rows... compare amount of text... biggest is doctor"
> NOTE: "Frequency (row count)" was mentioned in the discussion, but was immediately clarified to "total text length is more accurate."

**Doctor text composition:**
- Combine doctor turns (preserving newlines if needed) and pass to sentence segmentation.
- This combination method must also match the sample (to prevent whitespace/newline differences).

> **Discussion reference:** "He's putting it together... all sentences together... then segmentation"
> "Be super careful in the comparison"

---

### Step 2: Sentence Segmentation and Indexing ("Exact Match" Top Priority)

**Core requirement:**
- Michael uses `tidytext` + `unnest_tokens` in R for sentence segmentation.
- The Python implementation must produce results **completely identical to the sample**.

> **Discussion reference:** "critical part is unnest_tokens... do the same thing"
> "minimum change can... not valid anymore... must be exactly same as samples"

**Implementation strategy:**
- Jun mentioned "there is a Python library equivalent to R's tidytext unnest_tokens"
- Use that approach if possible, but ultimately **confirm by comparison with sample results**.

**Index generation:**

For each original row (doctor rows only):

- Split into sentences
- For each sentence:
  - `i` = original row number (1-based)
  - `i2` = sentence index within that row (1-based)
  - `index` = global sequential sentence index (1-based)

Output columns: `index`, `i`, `i2`, `speaker`, `text`

**State maintenance (required for indices/post-processing):**
- The model receives individual sentences, but indices/context require "sentence order/position within the entire note."
- Therefore, "sentence order/position" must be maintained even after segmentation.

> **Discussion reference:** "indexes rely on context of whole note... need keep state"
> "as long as they are in order, we can do post-processing"

---

### Step 3: Classification (Docker API Calls)

For each sentence:

- Run model inference via Docker API (`/predict/{model}`)
- 5 outcomes: cp, le, ed, inc, ius
- Store probability score per outcome (`.pred_1`, `.pred_0`)
- Order must be preserved

> **Discussion reference:** "Given a sentence, getting the probabilities... integrate with what you have"
> "pred1 gives probability... we select top sentences with highest pred1"

---

### Step 4: Top-10 Selection (Latest Agreement)

For each outcome:

- Sort by score descending
- Apply deterministic tie-breakers:
  1. `.pred_1` DESC
  2. `index` ASC
  3. `i` ASC
  4. `i2` ASC
- Select `top_k` sentences (default 10)
- With 5 domains, maintain a total of 50 sentences

> **Discussion reference:** "selection criteria was prob > 0.7... has changed this week... finally agreed top 10"
> "top 10 sentences for each domain... in the end keep 50 sentences"

---

### Step 5: Context Extraction (+/-3 Sentences)

For each Top sentence:

- Retrieve sentences in range: `index - context_window` through `index + context_window`
- If boundary exceeded, include available only (truncate without errors)
- Wrap target sentence with `<main>` tags:
  ```
  left context sentences.<main>Target sentence</main>.right context sentences
  ```
- Join all context sentences into single string (dot `.` separated)

> **Discussion reference:** "extend them at the context level... three before and three after"
> "he explains how he adds context... algorithm is there"
> The main sentence is marked with `<main>` tags. Left side is left context, right side is right context.

---

### Step 6: Output Export (Format Must Match)

**Intermediate Outputs (for validation):**

- `segmented_sentences.csv` -- segmentation results
- `predictions_long.csv` -- full prediction results
- `top10_by_outcome/*.csv` -- Top-10 per domain
- `top10_with_context/*.csv` -- Top-10 with context

**Final Output:**

Excel file including:

- metadata sheet
- segmented sheet
- predictions sheet
- outcome-specific sheets (per domain)

**Final output columns (minimum required):**

- `index`, `i`, `i2`
- `speaker`
- `text`
- `.pred_1` (per domain)
- `context` (including tags)

> **Discussion reference:** "export... the CSV file with the three indexes"
> "final output looks like... compare our outputs exactly the same"

---

## 7. TurboScribe Input Support (Operational Format Transition)

### 7.1 Format Differences

- Keystroke: Roles are often explicitly labeled (e.g., interviewer/patient). Turns are large.
- TurboScribe: Simple format with speaker1/speaker2. Turns may be split more finely.

### 7.2 Handling Rules

- Do not rely on role names; **identify the doctor by total text length** so it works regardless of format.
- Column name differences are absorbed by the config.

> **Discussion reference:** "new system is TurboScribe... speaker one/speaker two"
> "whatever speaker has highest... doctor for sure... compare amount of text"

---

## 8. Validation (As Important as Implementation)

### 8.1 Step-by-Step Validation Checkpoints (Required)

1. Keystroke input -> verify doctor filter results (reasonableness + sample comparison)
2. Compare sentence segmentation results (**top priority** -- sentence count / boundaries / text)
3. Compare index/i/i2 structure and values
4. Compare model call result format (column structure)
5. Compare Top-10 selection results per domain (index values must match)
6. Compare +/-3 context expansion results
7. Full comparison of final CSV/Excel (sort order / rows / columns / values)

> **Discussion reference:** "input -> segmented -> final output... compare exactly same"
> "be super careful in the comparison"

### 8.2 Validation Checklist

- [ ] Segmented sentence count matches reference
- [ ] index / i / i2 structure correct (all 1-based)
- [ ] Top-10 index values match validation example
- [ ] Context window extraction correct (`<main>` tags, dot-separated)
- [ ] Excel structure consistent
- [ ] Outputs are reproducible and deterministic

---

## 9. Edge Case Handling

- Missing speaker -> `"Unknown"`
- Empty text -> skip with log
- Tie scores -> deterministic ordering (score DESC -> index ASC -> i ASC -> i2 ASC)
- Context boundary clipping (when near the start/end, expand only within the available range)
- Duplicate file prevention

---

## 10. Completion Criteria (Acceptance Criteria)

For Jun's work to be considered "complete":

1. **Keystroke sample** input:
   - Final output CSV is **identical** to Michael's output (rows / sort order / columns / values)
2. **TurboScribe sample** input:
   - Doctor identification works reliably based on "total text length"
   - End-to-end execution is possible using the same pipeline
3. `top_k=10` rule is applied and adjustable via config
4. `index`/`i`/`i2` are generated and maintained, matching the sample
5. Context expansion (+/-3) is identical to the sample logic (including tags), and works without errors at boundaries
6. Module structure is maintained as an independent unit, and key step comments exist
7. SID test file reproduces the expected Top-10 selections
8. All intermediate artifacts are generated
9. Outputs are reproducible and deterministic

---

## 11. Risk Points (Warnings Raised During Discussion)

- Sentence segmentation differs even slightly from the sample -> downstream may become invalid
- Index generation logic differs -> debugging becomes impossible + surprises occur
- Top-10 / sorting criteria differ -> selected sentences change
- Context expansion logic differs -> final output structure mismatch
- Hardcoding without config -> breaks during TurboScribe transition
- Coupling with DB/GUI code -> maintenance/handover failure (spaghetti)

---

## 12. Collaboration (OneDrive)

- Gideon creates a folder on OneDrive
- Sample files and Jun's code/results are maintained in the same folder structure
- Jun must be able to share code + comparison results (match/mismatch summary)

> **Discussion reference:** "On OneDrive... create folder... we all working there"

---

## 13. Timeline

- Goal: complete pipeline by March
- First goal: show sample comparison results, confirm implementation correctness, then move to next phase

> **Discussion reference:** "has to be complete by March... start to close things"

---

# Appendix: Meeting Transcript (Original Discussion Script)

Yeah, it's like a little bit of the post-processing because when you get the sentences and the probabilities, he needs to extend them at the context level, putting three sentences before and three sentences after. So that's exactly true.

Pre-processing, NLP... That's the vacation and post-processing. Let's correct that. Right. And also there's something important in the post-processing, which is, And I think that he described it in an email, like how he was doing it. But basically he's adding two indexes that are important for downstream. might or might not be important. However, we want them to be exactly as They were used for the development of the classifier so that there's no surprises there.

And I think that he described that portion. I'm not really sure when you talked about the HTML files, if he added like another, probably like another call to make the, like one of those three steps, like if he implemented any of the ones that are... Because remember, Lilia, that we talked about, like, probably you were going to try to recreate his first step and probably, like... Like he said, third step, because the classifier is already there.

But I'm not sure like Because I think also that It is a little bit difficult to decouple the whole thing because The indexes rely on context of the whole note, not just the sentences. Because basically you send sentence by sentence, but then the index actually tells you With each paragraph it is something like that like to calculate the indexes at the end. So actually we need to keep state between...

We get the whole thing. And then we parse it and then we send each one of the to classify. We need to keep some sort of state of of which sentences was and where so that we can then When we do the post-processing,that information to the sentence. so that we have the indexes.

Yeah, but one thing that he explained it to me is actually We have three indexes: index, I, and I2. We just need index, and we just need a list of sentences. That's how he does it. With a list of sentences, we are okay.

The same list of sentences that we are scoring, we just need to keep, as you were saying, the state, the order, the index of each of them, and as long as they are in order, we can do the post-processing part. Can you show us, Jun, what you have? Oh, yeah. OK. On your side, so to be on the same context.

Give me one second, let me... Can you guys see my screen?

Yeah.

Sorry for taking time. So basically what I have is because Michael has the backend isn't it? I'm sorry the docker so basically what I made simply speaking if I give the text something like this. Now in return this prediction. So for CP, the prediction class 1 is this much and this much, something like this. Oh, this is great. So only issue is that, I mean, like because I talked with last week with Ivan, so in my end, I just pretend I have the pre-processing pipeline, but which is not really the same with what the Michael has.

So I was one because we kind of like try to reproduce everything with what Michael Michael did, isn't he? Exactly. So I was wondering like that part, pre-processing part for this Um... The ML classifier is now ready or like we have to still have to implement or we have to ask Michael to include in the Docker, something like that. I wasn't wondering. I wasn't sure.

That's a great question and I think Ivan suggested and I totally agree that I actually do that. I replicate that in Python or we replicate that in Python. We have the code in R from Michael and all the explanations in that HTML file and I think I can try to replicate that in Python. And then we need to integrate with that part that you're showing us.

Exactly. Given a sentence, getting the probabilities. So exactly. So I can just change the current module with what you have. When you share that, I can just simply just include it and then it will work Like this, like what I show. Yeah. And then...

Gideon, do you have like some samples of like, if you're processing like input output?

Yeah, definitely. That I can provide it, yeah.

Because probably you can download that for June. And then you can, I can try to incorporate And then put it, like the preprocessing and put it here. And then we canUm. analyze Michael's Michael is doing the indexes. And then also you can give him like, this is the type of export that I want. Remember that CSV file that you showed me with the three indexes? But then you can put together all those steps together Get...

But you don't have to worry about that. You get the output. And Jun can check. Because one of the things that is very important, Jun, is that... Once we do the Tenten segmentation? Uh... Gideon is going to give you some samples of them. Yeah, gotcha. It has to be It has to be exactly the same way as the samples of how it's happening on R Because of course the downstream classifiers have been trained on sentences that are structured like that.

So the minimum change can of course, and then the whole thing is not valid anymore. So... So we need to just like... Take that. is doing exactly everything If it's not, Like even the, if it's not, if it's something minor, maybe we can add some rules, but if it's not, If it's doing things differently, then We're gonna have to Uhhhh... Hello. Use the our code and call it somewhere somehow.

Yeah, I was trying to also investigate. Yeah, I think that's also another option.

Yeah, I totally I mean, it's possible, but it's messy. I don't really want to do that. but let's first try to recreate it because I think that it's, It is a matter of like There's going to be some sort of It's just like a... It's called a module in R. So there's going to be one that is on Python that is probably even the same name, even like the same, just for Python. That is a possibility. Or something very similar.

That is not a problem at all. So let's try that first because I think that's the easiest.

Gotcha. I got it.

Yeah, yeah, yeah. Yeah, sorry.

I know that you wanted to try that, but you know, so that you can continue to work on the AI stuff so that, you know...

Okay, yeah, and I was actually looking into that, because I was looking at Michael's call that week, and I found exactly what you're saying. He was using a library called TidyText, and that's for segmenting... Like The transcript into sentences. He's doing that in R using something called unnest tokens. And I found the same library in Python, so hopefully we can just use that library. Of course, we need to test it, as I almost said.

But yeah, that's exactly what we could do.

I think that there's not going to be a problem. And one of the things that you can do, Jun, is right now, I've been using Gemini a lot.

I have never used it.

And I have been having really good results. What you can try is completely use the logic of an R and ask Gemini or whatever you're using that is really good, translate this into Python.

Okay, I will try.

I mean, if it's like, I don't know, like... It's super simple, you don't have to do it. But if you see that it's a long screen that is doing you know, like something else, just do that so that you have a starting point and you don't have to start from scratch.

You're right, you're right.

Especially, I... The reason What I'm saying is because it is the same library, so now we can translate.

Before we couldn't because if it was a different library then...

You know, we couldn't translate directly, but given that it's the same library, I don't see why not.

Okay, sounds good, sounds good.

Yeah. Eh? So, I'm sorry, like for... The deadline, I think it's now coming very soon, which I didn't know. I thought it's like... June, but I just wanna likeNo, wait, huh?

No, it has to be complete by March.

I don't think there's going to be too much trouble.

So the thing is that-The thing is that we need to start to close things. Okay, so this is the first part. The first part of of the pipeline, we need to close it, which is... I look for a file, you have a worker, he's looking for a file, he grabs the file, And then it does the pre-processing, like the sentence segmentation, the classification using the calls to the Docker. And then it's stitched together in the way that he described it in the email.

And you copy there.

And if you have any questions, let us know.

But you copy there. He's saying like...

He's getting the indexes and putting the indexes together.

Are you going to recreate all of that? And then... Use the samples That key is for that... He's gonna give you like, From... The first file, like the original file, to how the segmented file looks like. to how the final output looks like. And so you need to compare and recreate all of those steps with our code. has their input. and their sample upload. and compare that our outputs are exactly the same.

Okay. And then we go from there, but first steps first.

Right? Sounds good.

Do you agree to you? Yeah, yeah, I totally agree. And would you mind if you guys, if I quickly share my screen? Because I actually have all those files now. And I can send them to June right now. So... Yeah, exactly. I can send you three things. As Ivan was saying, this is the input. This is actually the same file that Michael is processing here. It's called Rec 001 SIT 14. And this is the input file.

It's basically each row represents like a segment from the conversation. This is the input. These are not sentences still. These are like just segments or like turns. in a conversation. Then, of course, the HTML file, the one that does all the R code that Michael shared with us, very good comments, I think it's very nice. And then the output he gets here, This final output is saved into a different CSV file, which is called NLP by the process results So this input, code, and output.

Plus context because in the output.

So there's a couple of nuances, Jun.

is it was pretty nice Because Gigi and I have been talking about this before. That's why I know. The first nuance is when you get the initial file, You're gonna keep All of the sentences from the doctor only you're going to ignore all of the patients.

It's only interview.

The interviewer we don't care about. We only care about the doctor. What does the book process? That's it. The rest, right here, we don't really care about.

Yeah, look at it. Here, this is where Michael did that. Speaker equals interviewer. He just cares about that.

So he's filtering that. So think about like pandas and then you filter by, you know, like, you know, all of those or, you know, whatever, TSP, but... And I think that he's putting it together in a And In that case, in data, which is All of the sentences together, at that moment, I guess, like the new lines and stuff like that, I mean it doesn't matter, it's like a whole bunch of sentences. Then it does the segmentation on those.

Yep. But only, it's important, only the,They, uh, The doctor.

Exactly. Yeah, you can first try to do this in Python. As Ivan was saying, everything, I think, is very usable, easily replicated in Python with Pandas, of course, with AI, blah, blah, blah. The critical part is this one, and nest tokens. This is the part where you need to do the same thing, and this is the part where you can use the Python library that I sent it to you, because this is like the equivalent in Python to this library in R.

Okay. The rest of the stuff, You can just do it with fun as I was saying, it's very very easy. Except for the calling of the models where you use the Docker API.

Okay, gotcha. Thank you for the explanation. Appreciate it.

Yeah, those steps before, like, after sending them to, like, the... The tiny text? I don't know what that is.

I don't read art, so I have no idea because it seems that...

He's integrating that intoYeah, so like the pipe and then the following thing It seems like that is then sent to the other call to group by I and then all of that which I don't know like I haven't done R in a long time so you need to probably paste it And like, they'll learn and ask it like, what is that doing?

Because I have no idea.

And understand that group. You know, that call of group and then finish and ungroup and then he does like a mutable index.

I have no idea what's going on there. But you see, like, he's adding some indexes. Yes.

Like, you see, like, it has an index and then he has an I and I2 and then he has the speaker, which he already filtered, and then the text.

I already segmented.

But at this point, if you see there, he's creating... and I too. It seems that I2 is their row number. Yeah, so that he keeps track.

I think that he's keeping track of-Yeah, he's keeping track.

Yeah, he explained to me. But I think we just need the index, which make things way easier.

And We should keep probably all of it, because it's just a mathematical quick, you know, like...

Yeah, true. I don't think it's hard to do. No, no, it's true. And then also because if there's a problem, we can debug.

And I think that's the reason why he added that one. Because he wanted to see like, okay, there's a problem, Where is this coming from? That's true. That's true. Okay. Yeah. Let's keep it.

Let's keep it for now.

And Jung, if you have any questions, I can read our code and I know what the code is doing because Michael was explaining to me. So feel free to ask me whatever you need.

I think it's very easy. R is super easy.

And I think you would, with the help of AI, but please, whatever it is, me or even Michael would be happy to help.

Thank you so much. Thank you.

Of course. Yeah, and especially because I saw that when Jun saw us, The output of the Castifier, I saw that it was like one per rubric. But also it was the prediction zero and prediction one. And then at the end, he actually had like a... Like an overall prediction, like which was more important. I'm not really sure how he's using them. You mean Michael?

How he is using that?

Yeah. So for each-this is something we actually agreed a few days ago. So the reason we're doing this is we are selecting the top sentences, top 10 sentences. with the highest probability for each domain. Those are the only ones we keep. So in the end, we keep 50 sentences. the top 10 for each of the domain for the CP whatever and you're just interested in bread one this column bread one is the one that gives you the probability of being related to that domain so for example for CP, you just had to get the top 10 sentences, the top 10 sentences predicted with the highest probability for pred 1.

That's what you do for each domain, and that's the output. And then you expand it at the context level, and that's the output you get for each of the domains.

And that's also, Jun, something that he explains On the...

On the email, he explains how he adds context.

And context is basically the following. You have the sentence that is classified, right? And then you select the top 10? Yes. But before you give them You give them to the output, you're going to expand them by...

Three, the three sentence to the right, three sentence to the left. And he explains the algorithm and probably it's even there.

Oh yeah, here. Yep. I can see. It is here.

Yup. And the way he separates each, yeah, the sentence It's flagged by these main tags. And everything on the left domain is those three sentences on the left context and everything after the second main tag is on the right context. This is how he Um... FLAGS The main sentence. This is something you will find here in the cove.

It's exactly what Ivang is saying.

And let me tell you something. Here, He was... The selection criteria for the... For the sentence where whatever sentence is predicted with a probability higher than 0.7. This is something that has changed this week.

But we finally agreed we use the top 10.

We're going to use the top 10.

This is not the way we're going to do it. I think what I remember is that because I was working on last week about this. I think, yeah, in the... In the old code, it was something like top something. But I think when he shared this HTML, I was confused because now it was Yeah, I mean they changed he changed the end but I guess you guys agree with Like choosing the top 10.

Okay, exactly. We were doing experiments. We were different right? We were trying different criteria That's why once he sent you one now then he sent you another one the one we finally agree is top 10. Yeah, you're absolutely right. It was Providing a different criteria here, but the top 10 is the one but still the logic would work. Yeah, perfect. It's just you need to change this instead of selecting the top 10.

All of them, I just adopt them.

Okay, got it.

Yeah, and I think this is simple. Yeah, sorry. No, sorry. No, no, no. Go, go. Please, please.

No, no, after I was just actually closing so if it's still related to me Yeah, the last thing I'm gonna say is this is what Michael did, again, input to this script, output to this script, this script, there is something that will change in the production system, which is Because if you guys remember, Ella is gonna use TurboScribe. Yeah. Yeah. This was done using Keystroke. Keystroke was a company that were paying to manually transcribe the the conversation and put into a present, but I don't think things are gonna change much.

And I'm gonna send you that to YouTube.

This is the input that Michael is using. This is the rec 0015 blah, blah, blah, blah. And what you get here are turns. You gotta turn each row is a turning the conversation This is keystroke. This is the old system the new system It's turbo scribe, but the format is very similar. The format is very similar, but still for each of the rows, it is a turn. It is a turn. The difference that we have here, speaker one and speaker two, instead of interviewer and patient, but something very simple to do is justWhatever speaker has the highest number of rows, that is a doctor for sure.

Because of course the doctor is talking way more than the patient. You see what I mean? Whatever, if you do like count, speak, or whatever. I mean, of course we could have Ella just quickly giving us that demonstration. But this is the final format. This is the final format. This is the format that ERA sent to us. And this is, I guess, the format that we will be finally using, not the one that Michael was providing us with.

Yeah, so then, I think that what you need to do is have a config file and then tell it, like, what is the... column that has the text. And what is the column that has which speaker is talking. Have a configurable so that you can pass this one It doesn't matter if it has 10-At the end of the day, you only care about the speaker column and the text column. So if you put it in a configurer file, you just change the configurer file What is it called?

It is probably the same name as here. So then you can pass TurboStrike, you can pass this one, you can pass whatever. It is not going to care. It's gonna be the same.

It's a CSV file, right? Exactly. Both of them are CSV and as you were saying, actually the name of the columns are going to be the same. So that makes total sense.

But let's keep it in a configuration anyway. But don't like put, don't hard-code it, just in case, because they're being changed in this and... It's easier if you learn a config file and then you just set up there, and then you will just rename it if we need to. I think this is simple.

For you, there's nothing too complicated. Yes, yes, yes. Right? I mean... H.O.?

But, however, Be super. Careful in the comparison.

Yes, okay.

I got it. Let's make sure that we are creating exactly the sameOh. That's going to be important. Yes, yes. Let's have a target of this by tomorrow or by this time. You have a complete day. One day today, have them tomorrow. I think that that's plenty for this part because this part is not... I don't see his heart. Like, one of the things, though, that I signed your code is that It seems that you have a lot of things there.

Let's start, remember this pipeline has nothing to do with the database, has nothing to do with the What's it called? The...

The Lechka.

The GUIs, the Redcaps, this is a unit.

Right?

So let's remember that. So if you have it together with something, keep it super clean, copy it over, start in another thing. Not messy code, like super clean. Don't combine things together. This one, I itself and then we can do this. You can create a module that is called probably sentence classification. And in this module, so you have a main pipeline? Yes. Okay.

the main pipeline, you have a worker that is-and remember, you have a-You have a worker that is searching for an input in a configurable

If it finds one, then it calls the module, it grabs it, and then process it through the module, through that module. The module is going to be sentence specification, right? That one is going to do the pre-processing like They're removing all of the nonLike, uh... None doctors, speaker? Yeah. which the way that you're going to calculate it is not by the name but by the frequency. The speaker that has more frequent ones is the doctor.

Remove the other ones.

Don't go by doctor. Go by frequency. That's true.

That's the point.

Then Do the pre-processing of the sentence segmentation. Pass it through the... Blueberry, um... Specification. Remember keeping the indexes? Yes. Like calculating the indexes?

Put together the output. Compare it to the output and...

But it, Don't do it in a way that is like, okay, let's try it and then let's see if it works. No, let's build it in a pipeline way from the beginning. Okay? Very clean. I only want to see the main pipeline and one folder that has that module of sentence segmentation. Because then we're going to have the output and then we're going to have all the other modules one by one. So super clean. with comments and everything like very very clean, very maintainable so that we can, because it has to, the problem when we're in a hurry, is that sometimes we get spaghetti code and then very real comments.

And then when we need to go back because something is not working or something changed. So let's keep that in mind. Even if it seems like, oh, this is just doing this little thing. Let's still comment it. It doesn't have to have a huge comment and super detail.

I'm sorry, if you go back to the file, I'm sorry, with the R something like, yeah, this file, so here, So you mentioned, I'm sorry, when you say like frequency, based on frequency, I have to choose? Oh, not this one, like the CSV file? The R Sorry, could you repeat that part only again?

Like, I didn't get like... Yup, that is true and that's something, just as I was saying, As I was saying that, This is tricky because here the keystrokes The segments are bigger for the keystroke when the human were involved. I think with the TurboScribe, the segments are very small. So you can do that. I mean... The thing is here You have interviewer, patient, interviewer, patient, interviewer, patient was...

because a human was in the loop here and was actually doing the transcription. But here, you just have speaker one and then sometimes speaker two. Blah blah blah, but the turns are way smaller here. So what you could do is Yeah, I know because for this part Ivan, the frequency Of the turns, I don't think the interviewer is getting more frequencies cause they are longer. Cause they are longer here.

Yeah, that's right.

It's just more text. Yeah, it's just more text. Which is fine, the rest of the pipeline would be exactly the same, because we'll need to segment into sentences, blah blah blah. But how to derive the interviewer versus the patient? It would differ from Turber's quite tooky stroke, I guess.

No, I think that it will be fair, but also, There are some commonalities, and the commonalities is that one speaker speaks more than the other. And the way that we can do that, like, I don't know, for example, in Pandas is You get speaker one and speaker two combined Combine everything. Like, you know, Fandaz is really good at that, and then compare The amount of text in one and the amount of text in other.

Like group by speaker one, group by speaker two, the length, and then the biggest is the doctor. And if you do that, it doesn't matter if it's TurboScribe or this one.

The new one. Okay, because you said comparing not the frequency of the rows, the size of the text. That is true. That is perfect.

Exactly. So you combine the speakers. Like all of the rows for one speaker, all the rows for the other one, you do the group by. And then you see the length. The one that is bigger, that's the doctor. Exactly.

So you are calculating the total length? of the text for each of the speakers and that's a perfect way to compare that and that would work for both the TurboSquare and KeyStro you're absolutely right yeah What's that, Kirian?

Um... I think so, yeah. But what I will implement first, and then if I have more questions, I will reach out to you. If you are not busy, by the way.

So basically, Jun, you have You have... interviewer, like whoever is speaker and test, right? Do you have... In one, you have paragraphs that are really deep. The other one, what they're doing is that they'reYou're putting a lot of the same, right? Yeah. Oh. If you do a group by speaker one, He's going to get... All the text from speaker one. Yeah, yeah. And then if you do a group by speaker two, it's gonna do a...

It doesn't matter how they're called because it might be speaker one, speaker two, it might be a doctor, an interviewer, it doesn't matter. The point is that you group by the different names. Right? Yes. And then... Once you groove, you compare How much sex is your one? and how much is in the other, and then... and then you pick the big one. And also that is important. You don't care if the name of the speaker is Speaker interviewer and doctor or speaker one and speaker two.

It doesn't matter. So basically you do like unique. Give me the unique. Oh, names of that column, the column speaker. Right? Yeah. And then once you have those, then you do group by those, and then you pick the one that has the most amount of text, and then you move from there.

Got it. Sounds good.

And Joon, please, whatever questions you may have, it's great if you ask us. If you ask me about the R code, because it's way better to us now rather than implementing something that maybe we need to modify later.

So don't feel bad at all.

We're probably the other way around.

Thank you so much.

And I will be so happy to answer whatever questions you may have.

Thank you so much. Yeah, if you have a doubt, don't go by like, "Okay, I think this is... No, ask us." We have limited time. And so, you know, it's very few Oscars. Okay, thank you. And then, and then that is, that is super clear because like maybe if let's say you work today and tomorrow, right? Tomorrow at noon we meet again to see this part and then make sure that it was implemented well and then we agree on next steps.

Right? Sounds good. You only have... the holiday of tomorrow. which means there's going to be things to be completed and I might be picking up from there. So the best thing to do is to ask us if you're not sure, ask us so that... we're sure that that is completed. And then I can pick up from there. And next Thursday, I can tell you, oh, this is what I did.

You can continue here. You know what I mean? Sounds good. Go ahead. Okay.

That was great. We're on the same page?

Yes, yes. I think so.

All right. I'm gonna try to write like the one we agreed on and please like feel free to add things because I might DJ, like, I will add the steps. But if I miss something like... Details? Even if it's small, add it to the steps so that we know exactly, OK, this is what's happening. So that June has all of the specifications of this part, and then And then we continue. Because I think most likely I'm going to miss something.

I will start if you want with the framework, and then we'll continue.

Thank you. And I'll send you those four files, the two kind of inputs, the HTML file, and the output. Thank you.

Let's do this. On OneDrive, Uh... Let's start a folder. Let me create it right now. We all are going to be working there. Sounds good? Okay.

That sounds good, and I think it's good that you created live and just in case, yeah,Then...

Yeah, I was gonna say Ukrainian and I was like, oh, well, probably.

Yeah, we need to learn from the past. Exactly. Oh. Okay.

Okay, so I will... I will send you guys a text when the folder is created. And then I will put something like... working files or something like so that you know to share like the input files and all that youSounds good. Yeah. And then you put the... And then I'm gonna put like... And then there you like directly work on the pipeline there. Like all of the files and stuff, right? Like all of the code.

And then we meet tomorrow around this time?

Sounds good. Sounds great. Perfect. Thank you guys.

Thank you so much.

Thank you so much, guys. See you tomorrow. Bye. Bye. See you. Thank you so much, guys. See you tomorrow. Bye. Bye. See you.
