import { TRACK_DEFAULT, TRACK_MAX, TRACK_MIN } from "../src/loops/types";

describe("track count bounds", () => {
  it("supports 2 through 8 with default 4", () => {
    expect(TRACK_MIN).toBe(2);
    expect(TRACK_MAX).toBe(8);
    expect(TRACK_DEFAULT).toBe(4);
  });
});
