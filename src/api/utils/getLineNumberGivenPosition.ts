export const getLineNumberGivenPosition = (lines: string[], position: number): number => {
  let currentPos = 0;

  return lines.findIndex(line => {
    currentPos += line.length + 1; // +1 for the newline character
    return position < currentPos;
  });
};
