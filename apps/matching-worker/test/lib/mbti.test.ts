import { calculateMbtiCompatibility } from "../../src/lib/mbti"

describe("calculateMbtiCompatibility (worker)", () => {
  it("両者 null なら null", () => {
    expect(calculateMbtiCompatibility(null, null)).toBeNull()
  })

  it("片方 null なら null", () => {
    expect(calculateMbtiCompatibility("INTJ", null)).toBeNull()
    expect(calculateMbtiCompatibility(null, "ENFP")).toBeNull()
  })

  it("不正形式は null", () => {
    expect(calculateMbtiCompatibility("ABCD", "ENFP")).toBeNull()
    expect(calculateMbtiCompatibility("INTJ", "")).toBeNull()
    expect(calculateMbtiCompatibility("intj", "ENFP")).toBeNull()
  })

  it("INTJ × ENFJ（E/I diff + N/S same + T/F diff + J/P same）= 25+25+25+25 = 100", () => {
    expect(calculateMbtiCompatibility("INTJ", "ENFJ")).toBe(100)
  })

  it("INTJ × ENFP（E/I diff + N/S same + T/F diff + J/P diff）= 25+25+25+12 = 87", () => {
    expect(calculateMbtiCompatibility("INTJ", "ENFP")).toBe(87)
  })

  it("INTJ × INTJ（全次元 same）= 15+25+18+25 = 83", () => {
    expect(calculateMbtiCompatibility("INTJ", "INTJ")).toBe(83)
  })

  it("結果は 57..100 のレンジ", () => {
    const types = ["E", "I"].flatMap((a) =>
      ["N", "S"].flatMap((b) =>
        ["T", "F"].flatMap((c) => ["J", "P"].map((d) => `${a}${b}${c}${d}`)),
      ),
    )
    for (const x of types) {
      for (const y of types) {
        const score = calculateMbtiCompatibility(x, y)
        expect(score).not.toBeNull()
        expect(score!).toBeGreaterThanOrEqual(57)
        expect(score!).toBeLessThanOrEqual(100)
      }
    }
  })
})
