const CANNED: string[] = [
  "That's a thoughtful question. At its core, what you're describing touches on the tension between local optima and global solutions. When systems are complex enough, the best path forward is rarely obvious from any single vantage point — it requires iteration, observation, and a willingness to revise assumptions.",

  "Interesting framing! The way I'd think about this: imagine the problem space as a landscape with peaks and valleys. You're not just looking for the highest peak — you're looking for the one that's most accessible given your current position and constraints. Sometimes a slightly lower peak reached quickly beats a perfect summit never reached.",

  "Great prompt. Here's the core tension: short-term legibility versus long-term adaptability. Systems optimized purely for current understanding tend to calcify. Those optimized for change tend to become incomprehensible. The art is in designing interfaces between them — stable enough to reason about, flexible enough to evolve.",

  "This reminds me of a classic problem in information theory: the trade-off between compression and expressivity. When you compress aggressively, you lose the nuance that allows for novel recombination. When you keep everything explicit, you drown in detail. The sweet spot depends heavily on what questions you're likely to ask later.",

  "Honestly, I think the most underrated aspect of this is the *timing* dimension. Most analyses treat the problem as static, but the optimal answer in month one often undermines the optimal answer in month twelve. Adaptive strategies that explicitly model their own obsolescence tend to outperform locally optimal but rigid ones.",

  "The way I see it, there are really two separate questions hidden in here. The first is empirical: what does the evidence actually show? The second is normative: given that evidence, what *should* we do? People often conflate them, which leads to talking past each other. Separating them makes the actual disagreement much clearer.",

  "What you're describing is essentially a coordination problem wrapped in a technical problem. The technical part is usually solvable — the coordination part is where things get stuck. In my experience, the limiting factor is almost never the absence of a good solution, but the absence of a shared model of what 'good' even means in context.",

  "That's a fascinating angle. The counter-intuitive insight here is that constraints often *increase* creativity rather than limiting it. Unconstrained problem spaces tend to produce either paralysis or arbitrary choices. A well-chosen constraint focuses attention in ways that generate genuinely novel solutions within the constrained space.",

  "Let me push back gently on the premise: the assumption that more information always leads to better decisions is surprisingly fragile. Past a certain density, additional information introduces noise faster than signal. The skill isn't in gathering more — it's in filtering ruthlessly and acting on incomplete information with calibrated confidence.",

  "The part of this I find most interesting is the feedback loop dimension. Most interventions change the system they're trying to measure or fix, which means the model you built to justify the intervention is no longer accurate once you act on it. Robust strategies account for this reflexivity rather than treating the environment as static.",
];

export async function simulateAI(
  prompt: string,
  parentPrompt?: string,
  parentResponse?: string
): Promise<string> {
  const delay = 700 + Math.random() * 1200;
  await new Promise((r) => setTimeout(r, delay));

  const base = CANNED[Math.floor(Math.random() * CANNED.length)];

  if (parentPrompt) {
    const snippet = parentPrompt.slice(0, 40);
    return `Building on the earlier thread about "${snippet}…"\n\n${base}`;
  }

  return base;
}
