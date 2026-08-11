export type Difficulty = "Easy" | "Medium" | "Hard";

export interface HintLadder {
  level: 1 | 2 | 3;
  text: string;
}

export interface Question {
  id: string;
  title: string;
  company: string;
  difficulty: Difficulty;
  expectedTimeMinutes: number;
  statement: string;
  constraints: string[];
  clarifications: string[];
  solutions: string[];
  commonMistakes: string[];
  edgeCases: string[];
  hintLadder: HintLadder[];
  followups: string[];
  rubricNotes: string[];
  starterCode: string;
  expectedComplexity: {
    time: string;
    space: string;
  };
}

export interface CompanyProfile {
  id: string;
  name: string;
  styleLabel: string;
  description: string;
  behaviors: string[];
}
