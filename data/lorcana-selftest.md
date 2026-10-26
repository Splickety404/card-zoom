## Picture index: lorcana

3501 artworks, 0.3 MB. Chosen colour weight 3, max distance 49.4.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 799 | 98.0% | 99.4% | 99.7% | 99.7% | 99.7% | 99.9% | 43.4 / 56.9 | 28.7 |
| 48 | 799 | 98.6% | 99.6% | 99.7% | 99.7% | 99.7% | 99.9% | 39.0 / 50.9 | 33.6 |
| 72 | 799 | 99.7% | 99.7% | 99.7% | 99.7% | 99.7% | 99.7% | 34.8 / 47.0 | 37.7 |
| 120 | 799 | 99.7% | 99.7% | 99.7% | 99.7% | 99.7% | 99.7% | 30.5 / 41.6 | 42.0 |

Non-card crops, best distance (chosen w): p05 75.3, p50 93.5, p90 107.7

### Learned embedding

Top-1 by card height: 32px 98.7%, 48px 99.9%, 72px 100.0%, 120px 100.0%.
Correct matches' similarity p05 0.784, p50 0.884; lead p10 0.172. Non-cards' best similarity p50 0.422, p99 0.676.
Accepted (similarity ≥ 0.676, lead ≥ 0.02) and correct: 32px 82.9%, 48px 99.5%, 72px 100.0%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 77.3%, 48px 93.0%, 72px 96.7%, 120px 99.2%
