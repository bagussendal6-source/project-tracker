import { useState } from "react";
import type { KnownProject } from "../../src/core/api-types.ts";
import { api } from "../api.ts";
import { ago, shortPath } from "../lib/format.ts";

/** First-launch introduction: three calm steps, nothing analyzed until the user asks. */
export function Welcome({
  known,
  tracked,
  onDone,
}: {
  known: KnownProject[];
  tracked: Set<string>;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const candidates = known.filter((k) => !tracked.has(k.root)).slice(0, 12);

  async function finish() {
    for (const root of picked) await api.addProject(root);
    onDone();
  }

  async function chooseFolder() {
    const root = await api.pickFolder();
    if (root) {
      await api.addProject(root);
      onDone();
    }
  }

  return (
    <div className="welcome">
      {step === 0 && (
        <div className="step" key="0">
          <h1>Remember where you left off.</h1>
          <p>
            Project Tracker reads the projects you've set aside and tells you, in plain language, what you built, what's still missing, and the
            one thing to do next.
          </p>
          <div className="nav-row">
            <button className="btn primary" onClick={() => setStep(1)} autoFocus>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="step" key="1">
          <h1>How it reads a project</h1>
          <ul className="points">
            <li>It looks at the files, the git history, and your past Claude Code conversations about the project.</li>
            <li>Claude then reads the code to check what actually works. It only reads, and it never changes anything.</li>
            <li>It runs through the Claude app already signed in on this Mac, so there's no extra account or key.</li>
            <li>Nothing is read until you ask. Each project takes a minute or two.</li>
          </ul>
          <div className="nav-row">
            <button className="btn primary" onClick={() => setStep(2)} autoFocus>
              Continue
            </button>
            <button className="quiet" onClick={() => setStep(0)}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="step" key="2">
          <h1>Choose your projects</h1>
          {candidates.length > 0 ? (
            <>
              <p>These folders appear in your Claude Code history. Pick any you'd like to keep track of. You can add more later.</p>
              <div className="pick">
                {candidates.map((k) => (
                  <label key={k.root}>
                    <input
                      type="checkbox"
                      checked={picked.has(k.root)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(k.root);
                        else next.delete(k.root);
                        setPicked(next);
                      }}
                    />
                    <span>{k.root.split("/").pop()}</span>
                    <span className="p" title={shortPath(k.root)}>
                      {ago(k.lastUsed)}
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p>Pick a project folder to start with. You can add more later.</p>
          )}
          <div className="nav-row">
            <button className="btn primary" onClick={finish}>
              {picked.size ? `Add ${picked.size} project${picked.size > 1 ? "s" : ""}` : tracked.size ? "Done" : "Skip for now"}
            </button>
            <button className="textlink" onClick={chooseFolder}>
              Choose another folder…
            </button>
          </div>
        </div>
      )}

      <div className="pager" aria-hidden>
        {[0, 1, 2].map((i) => (
          <i key={i} className={i === step ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}
