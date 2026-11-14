export type ScriptureReview = Record<string, string | boolean | undefined> & {
  translation?: string;
  reference?: string;
  kind?: string;
  scope?: string;
};
export const nivNotice: string;
export function publicationReady(record: ScriptureReview, translation: string): boolean;
export function scriptureReview(
  scope: string,
  record: ScriptureReview,
  inherited: string,
  onChange: () => void,
  flagged?: boolean,
): HTMLDetailsElement;
