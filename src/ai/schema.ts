// JSON Schema passed to `claude --json-schema`. Must stay in sync with `Report` in ../types.ts.

const str = (description: string) => ({ type: "string", description });
const strArr = (description: string) => ({ type: "array", items: { type: "string" }, description });
const en = (values: string[], description: string) => ({ type: "string", enum: values, description });
const obj = (properties: Record<string, unknown>, description?: string) => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arr = (items: unknown, description: string) => ({ type: "array", items, description });

const evidence = obj({
  kind: en(["file", "commit", "session", "todo", "doc"], "Type of evidence."),
  ref: str("File path (optionally path:line), short commit hash, session id/title, or doc path."),
  note: str("What this evidence shows, in a few words."),
});

const size = en(["S", "M", "L"], "S = under a day of focused work, M = a few days, L = a week or more.");

export const reportSchema = obj({
  identity: obj({
    name: str("Human-friendly project name."),
    one_liner: str("One sentence: what this is."),
    problem: str("The problem it solves and for whom."),
    target_users: str("Who would use it."),
    project_type: en(
      [
        "web_app",
        "mobile_app",
        "desktop_app",
        "cli_tool",
        "library",
        "api_service",
        "game",
        "bot_automation",
        "data_ml",
        "extension_plugin",
        "content_docs",
        "other",
      ],
      "Primary project type.",
    ),
    stack: strArr("Main languages, frameworks and services."),
    charter: obj(
      {
        mvp_definition: str("What 'done' means for a first usable version, inferred from intent."),
        in_scope: strArr("Capabilities the MVP must have."),
        out_of_scope: strArr("Ideas present in the project that are NOT needed for the MVP."),
      },
      "Inferred goal the project is measured against. The user can edit this later.",
    ),
  }),
  where_you_left_off: obj({
    last_activity: str("Date (YYYY-MM-DD) of the most recent real work."),
    summary: str("2-4 sentences: what the developer was doing when they stopped."),
    in_progress_task: str("The specific task that was underway, or empty if work stopped cleanly."),
    state: en(["clean", "mid_change", "broken", "unknown"], "State of the working tree when work stopped."),
    evidence: arr(evidence, "Evidence for the above."),
  }),
  features: arr(
    obj({
      id: str("Short kebab-case id, unique in this report."),
      name: str("Feature name."),
      description: str("What it does for the user."),
      status: en(
        ["done", "partial", "stub", "planned"],
        "done = works end-to-end; partial = works but incomplete; stub = scaffolding/placeholder only; planned = mentioned in docs/sessions/TODOs, no real code.",
      ),
      size: size,
      in_mvp: { type: "boolean", description: "Is this part of the charter's MVP scope?" },
      confidence: en(["high", "medium", "low"], "How sure you are about the status, given what you read."),
      evidence: arr(evidence, "Files/commits/sessions that support the status. At least one for done/partial."),
      missing: str("What is missing for it to be done, or empty if done."),
    }),
    "User-facing capabilities, 4-20 of them. Group small things; do not list every file.",
  ),
  phases: arr(
    obj({
      name: str("Short label, e.g. 'Scaffolding', 'Auth push', 'Pivot to CLI'."),
      start: str("YYYY-MM-DD"),
      end: str("YYYY-MM-DD"),
      kind: en(["setup", "build", "pivot", "polish", "dormant"], "What kind of period this was."),
      summary: str("One sentence on what happened."),
    }),
    "Chronological phases of the project's history, including dormant gaps longer than ~2 weeks.",
  ),
  remaining: arr(
    obj({
      title: str("Short imperative title."),
      detail: str("What exactly needs doing and where."),
      category: en(["feature", "bug", "debt", "infra", "docs", "polish", "testing"], "Kind of work."),
      effort: size,
      blocks_mvp: { type: "boolean", description: "Must this be done before the MVP is usable?" },
      feature_id: str("Related feature id, or empty."),
    }),
    "Work left, most important first.",
  ),
  tech_debt: arr(
    obj({
      title: str("Short title."),
      detail: str("Why it matters."),
      severity: en(["low", "medium", "high"], "Impact if left alone."),
      refs: strArr("File paths involved."),
    }),
    "Notable technical debt, risky code, or structural problems. Empty if none.",
  ),
  potential: obj({
    could_become: str("What this could realistically grow into."),
    use_cases: strArr("Concrete use cases."),
    similar_tools: strArr("Existing tools/products in the same space, if you know any."),
    scores: obj(
      {
        remaining_effort: { type: "integer", minimum: 1, maximum: 5, description: "1 = nearly done, 5 = huge amount left." },
        momentum: { type: "integer", minimum: 1, maximum: 5, description: "1 = long dormant, 5 = very active." },
        novelty: { type: "integer", minimum: 1, maximum: 5, description: "1 = many equivalents exist, 5 = genuinely new." },
        usefulness: { type: "integer", minimum: 1, maximum: 5, description: "1 = toy, 5 = solves a real, frequent problem." },
      },
      "Scores from 1 to 5.",
    ),
    verdict: en(["continue", "narrow_scope", "pivot", "park", "archive"], "Recommendation."),
    verdict_reasoning: str("2-4 sentences justifying the verdict, honestly."),
    risks: strArr("What could make continuing a waste of time."),
  }),
  next_steps: arr(
    obj({
      title: str("Short imperative title."),
      why: str("Why this is the right next move."),
      how: strArr("Concrete steps, naming files where relevant."),
      estimate_minutes: { type: "integer", minimum: 5, description: "Estimated focused minutes." },
      files: strArr("Files to open first."),
    }),
    "Exactly 3, in order. The first must take under 60 minutes and get the developer back into flow.",
  ),
  open_questions: strArr("Things you could not determine that only the developer can answer. 0-5 items."),
});
