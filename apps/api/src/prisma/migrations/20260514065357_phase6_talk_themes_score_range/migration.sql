-- AlterTable
ALTER TABLE "talk_themes" ADD COLUMN     "target_score_max" INTEGER,
ADD COLUMN     "target_score_min" INTEGER;

-- CheckConstraint: target_score_min は 0..100
ALTER TABLE "talk_themes"
  ADD CONSTRAINT "talk_themes_target_score_min_range"
    CHECK ("target_score_min" IS NULL OR ("target_score_min" >= 0 AND "target_score_min" <= 100));

-- CheckConstraint: target_score_max は 0..100
ALTER TABLE "talk_themes"
  ADD CONSTRAINT "talk_themes_target_score_max_range"
    CHECK ("target_score_max" IS NULL OR ("target_score_max" >= 0 AND "target_score_max" <= 100));

-- CheckConstraint: target_score_min <= target_score_max
ALTER TABLE "talk_themes"
  ADD CONSTRAINT "talk_themes_target_score_min_le_max"
    CHECK (
      "target_score_min" IS NULL
      OR "target_score_max" IS NULL
      OR "target_score_min" <= "target_score_max"
    );
