import type { MinigameId } from "./messages.js";

export type MinigameHelpCopy = {
  rules: string[];
  controls: string[];
};

export const MINIGAME_HELP: Record<MinigameId, MinigameHelpCopy> = {
  kart: {
    rules: [
      "Complete 2 laps to win the race.",
      "Steer around the track; brushing walls slows you down.",
      "Each racer has two boosts per race for extra speed while the boost lasts.",
    ],
    controls: [
      "◀ ▶ — Steer",
      "Boost — Speed burst (two uses per race)",
      "Pause — Pause the whole race",
    ],
  },
  race_walk: {
    rules: [
      "Every runner looks the same. Figure out which runner you are controlling without being obvious",
      "Runners move toward the finish in fixed lanes. Reach the end to win.",
      "Walk steadily or run faster — NPCs don't run so running will give away your position.",
      "Players control a crosshair over the lanes and can fire to knock an enemy runner down.",
      "Figure out which runners are controlled by players and shoot them",
      "Don't be obvious with your movement! Other player are trying to shoot you",
    ],
    controls: [
      "Walk — Move forward at a steady pace",
      "Run — Move faster",
      "Aim up / Aim down — Move crosshair between lanes (crosshair)",
      "Fire — Fire one bullet (crosshair)",
      "Pause — Pause the minigame",
    ],
  },
  frogger: {
    rules: [
      "Climb the scrolling course toward the far side.",
      "Cross streets without getting hit by cars.",
      "Ride logs and lily pads across water — falling in the water ends your run.",
      "Survive as far as you can; The player with the furthest DISTANCE wins.",
    ],
    controls: [
      "◀ ▶ ▲ ▼ — Move one tile at a time",
      "Pause — Pause for everyone",
    ],
  },
  football: {
    rules: [
      "Pick Red or Blue, then START (any controller) when everyone is ready. Unpicked players are auto-balanced.",
      "Kickoff lines everyone up in their own end zone (spread top-to-bottom). A live ball starts midfield on the opening kick; after a touchdown the other team gets the next snap much closer to their goal.",
      "While carrying, Pass throws a live ball along your current movement (or straight toward the opponent goal if you aren’t moving).",
      "After a tackle, teammates wait 2s before scooping the loose ball; the tackling side waits 0.5s.",
      "You cannot rush a live loose ball past the sidelines or into either end zone — squeeze it on the grass first.",
      "Carry across the opposing goal line — first team to the touchdown total wins (set in Game settings on your phone).",
      "A 5:00 clock runs out to overtime: whoever leads wins — game ends on the next tackle or touchdown (tie if still tied after either).",
    ],
    controls: [
      "Joystick — Move in every direction at walk / run / sprint push",
      "Pass — While carrying, throws the ball along your current move direction (toward your goal line if you’re standing still)",
      "Pause — Pause on the TVs for everyone",
    ],
  },
  air_hockey: {
    rules: [
      "Pick Red or Blue, then START (any controller) when everyone is ready. Unpicked players are auto-balanced.",
      "You are a mallet locked to your own half of the rink — slide around to defend your goal and attack the other side.",
      "The puck glides and bounces off the rink walls. Drive your mallet into it to knock it across the rink.",
      "Score by sending the puck through the opening in the opponent's end wall.",
      "First team to the goals-to-win total wins (set in Game settings on your phone).",
      "A match clock runs out to overtime: whoever leads wins — the game ends on the next goal (tie if still tied).",
    ],
    controls: [
      "Joystick — Move your mallet in every direction (locked to your half)",
      "Pause — Pause on the TVs for everyone",
    ],
  },
};
