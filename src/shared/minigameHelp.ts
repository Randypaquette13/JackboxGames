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
      "A match clock runs out with the leading team winning; if the score is tied, sudden-death overtime begins and the next goal wins.",
    ],
    controls: [
      "Joystick — Move your mallet in every direction (locked to your half)",
      "Pause — Pause on the TVs for everyone",
    ],
  },
  dodgeball: {
    rules: [
      "Pick Red or Blue, then START when everyone is ready. Unpicked players are auto-balanced.",
      "Stay on your own half of the court — you cannot cross the center line.",
      "Six balls start at midfield. Grab loose balls by walking into them or press Catch to root briefly and snag one on contact.",
      "While holding a ball, Throw sends it along your movement direction. The ball glows your team color for a short window.",
      "During that live window, a hit on an opponent eliminates them. If they Catch your live throw, you are out, one of their eliminated teammates returns (first out, first back), and they take the ball.",
      "Eliminate every player on the other team to win the round. First team to the rounds-to-win total takes the match.",
    ],
    controls: [
      "Joystick — Move on your half (walk / run / sprint push)",
      "Catch — When empty-handed, root briefly to grab a ball on contact",
      "Throw — While holding a ball, hurl it along your move direction",
      "Pause — Pause on the TVs for everyone",
    ],
  },
  bomberman: {
    rules: [
      "Move on a grid and place bombs to blast rivals and break soft blocks.",
      "Explosions travel in a cross shape and chain to other bombs.",
      "Broken blocks may drop power-ups: extra bombs, longer blasts, or faster movement.",
      "Last player alive wins the round.",
    ],
    controls: [
      "◀ ▶ ▲ ▼ — Move one tile at a time",
      "Bomb — Place a bomb on your tile",
      "Pause — Pause for everyone",
    ],
  },
  pacman: {
    rules: [
      "Work together on one maze — clear every pellet to win as a team.",
      "Small pellets are 10 pts; power pellets are 50 pts and scare ghosts for a few seconds.",
      "While ghosts are frightened you can eat them for 200 pts; they respawn at the ghost house.",
      "Each player has a limited number of lives (adjust in Game settings). When caught, you lose a life and respawn if any remain.",
      "If everyone runs out of lives, the run ends in defeat.",
    ],
    controls: [
      "◀ ▶ ▲ ▼ — Move through the maze",
      "Pause — Pause for everyone",
    ],
  },
};
