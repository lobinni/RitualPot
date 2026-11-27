"use client";

import { SectionHead } from "./ui";

/**
 * The questions a member can answer for themselves before any money moves.
 * Every answer is a property of the contract, not of this console.
 */

const QUESTIONS: Array<[string, string]> = [
  [
    "What is the goal, and what happens to the money?",
    "The goal, the number and length of periods, the stake, the member cap, the rounds, the joining window and the ruling window are fixed when the ritual opens. There are no setters and no owner afterwards.",
  ],
  [
    "Can the page talk the judge into a yes?",
    "The page is fenced as untrusted data, and instruction-like phrasing is flagged and stored with every round. The model only proposes met or not met: a different shape, a different casing or an invented verdict counts for nothing, and the contract checks the agreed answer itself.",
  ],
  [
    "Can one odd reading decide a period?",
    "With two agreeing rounds the same answer has to arrive twice, a full interval apart. A different answer restarts the count, and a round that cannot rule moves nothing while staying on record as evidence.",
  ],
  [
    "What exactly is judged?",
    "The page frozen whole when the member posted it, at most twelve hundred characters, so every validator reads all of it. Editing the live page afterwards changes nothing.",
  ],
  [
    "Can I be tricked into a wrong stake?",
    "Joining accepts only the exact stake. Everything it cannot accept is credited to that address alone and never lost, and only that address can take it back.",
  ],
  [
    "Can transaction order decide who is paid?",
    "No. Rulings stop at the final deadline, and settling before it is accepted only when nothing is left to rule — the schedule never offers both at once.",
  ],
];

export function Trust() {
  return (
    <section
      className="mt-16 border-y border-[var(--t-line)]"
      style={{ background: "var(--t-accent-soft)" }}
      aria-labelledby="trust-title"
    >
      <div className="shell py-16">
        <div id="trust-title">
          <SectionHead
            index="01 · before you stake"
            title="What you can check for yourself"
            intro="Read these answers off the contract, not off this page. Everything below is a property of the code that holds the money."
            aside={<span className="chip chip-quiet">no setters · no owner · paged views</span>}
          />
        </div>

        <div className="grid gap-x-14 gap-y-0 lg:grid-cols-2">
          {QUESTIONS.map(([question, answer], index) => (
            <article
              key={question}
              className="border-t border-[var(--t-line)] py-6 first:border-t-0 lg:first:border-t lg:[&:nth-child(2)]:border-t-0"
            >
              <div className="flex items-start gap-4">
                <span className="mono pt-1 text-[11px] text-[var(--t-accent-dark)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="display text-[17px] leading-snug">{question}</h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#2c3833]">{answer}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-10 max-w-[720px] border-l-2 border-[var(--t-ink)] pl-4 text-[13.5px] leading-relaxed text-[#2c3833]">
          <span className="label label-ink">what you still trust</span>
          <span className="mt-2 block">
            That the goal asks for something one page can show — the creator writes it, so read it
            before you stake — and that validators agree on whether a page meets it. A model can read
            a borderline page either way; with two rounds a single odd reading cannot decide a
            period.
          </span>
        </p>
      </div>
    </section>
  );
}
