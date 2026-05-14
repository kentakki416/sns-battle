import { calculateMbtiCompatibility } from "../../src/lib/mbti"

describe("calculateMbtiCompatibility", () => {
  describe("【正常系】", () => {
    it("完全に同じタイプ同士は same 重みの合計（INTJ × INTJ = 15 + 25 + 18 + 25 = 83）", () => {
      expect(calculateMbtiCompatibility("INTJ", "INTJ")).toBe(83)
    })

    it("E/I のみ異なる場合は 25 + 25 + 18 + 25 = 93（INTJ × ENTJ）", () => {
      expect(calculateMbtiCompatibility("INTJ", "ENTJ")).toBe(93)
    })

    it("N/S のみ異なる場合は 15 + 12 + 18 + 25 = 70（INTJ × ISTJ）", () => {
      expect(calculateMbtiCompatibility("INTJ", "ISTJ")).toBe(70)
    })

    it("T/F のみ異なる場合は 15 + 25 + 25 + 25 = 90（INTJ × INFJ）", () => {
      expect(calculateMbtiCompatibility("INTJ", "INFJ")).toBe(90)
    })

    it("J/P のみ異なる場合は 15 + 25 + 18 + 12 = 70（INTJ × INTP）", () => {
      expect(calculateMbtiCompatibility("INTJ", "INTP")).toBe(70)
    })

    it("「golden pair」とされる相補的な組み合わせ INFJ × ENTP は 25 + 25 + 25 + 12 = 87", () => {
      expect(calculateMbtiCompatibility("INFJ", "ENTP")).toBe(87)
    })

    it("完全反対型 INFJ × ESTP は 25 + 12 + 25 + 12 = 74", () => {
      expect(calculateMbtiCompatibility("INFJ", "ESTP")).toBe(74)
    })

    it("理論的最小スコア（E/I 同 + N/S 異 + T/F 同 + J/P 異）= 57（INTJ × ISTP）", () => {
      expect(calculateMbtiCompatibility("INTJ", "ISTP")).toBe(57)
    })

    it("理論的最大スコア（E/I 異 + N/S 同 + T/F 異 + J/P 同）= 100（ISTJ × ESFJ）", () => {
      expect(calculateMbtiCompatibility("ISTJ", "ESFJ")).toBe(100)
    })

    it("引数の順序は結果に影響しない（対称性）", () => {
      expect(calculateMbtiCompatibility("INFJ", "ENTP")).toBe(
        calculateMbtiCompatibility("ENTP", "INFJ"),
      )
    })
  })

  describe("【異常系】", () => {
    it("いずれかが null → null", () => {
      expect(calculateMbtiCompatibility(null, "INTJ")).toBeNull()
      expect(calculateMbtiCompatibility("INTJ", null)).toBeNull()
      expect(calculateMbtiCompatibility(null, null)).toBeNull()
    })

    it("いずれかが undefined → null", () => {
      expect(calculateMbtiCompatibility(undefined, "INTJ")).toBeNull()
      expect(calculateMbtiCompatibility("INTJ", undefined)).toBeNull()
    })

    it("形式不正（短い / 長い）→ null", () => {
      expect(calculateMbtiCompatibility("INT", "INTJ")).toBeNull()
      expect(calculateMbtiCompatibility("INTJP", "INTJ")).toBeNull()
    })

    it("形式不正（無効な文字）→ null", () => {
      expect(calculateMbtiCompatibility("AAAA", "INTJ")).toBeNull()
      expect(calculateMbtiCompatibility("XYZW", "INTJ")).toBeNull()
    })

    it("形式不正（小文字）→ null（厳格に大文字のみ受理）", () => {
      expect(calculateMbtiCompatibility("intj", "INTJ")).toBeNull()
    })
  })
})
