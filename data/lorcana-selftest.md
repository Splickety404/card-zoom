## Picture index: lorcana

3501 artworks, 0.3 MB. Chosen colour weight 2, max distance 38.4.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 799 | 98.1% | 99.6% | 99.7% | 99.7% | 99.9% | 99.9% | 32.7 / 43.5 | 22.5 |
| 48 | 799 | 99.4% | 99.7% | 99.9% | 99.9% | 99.9% | 99.9% | 29.5 / 39.2 | 26.2 |
| 72 | 799 | 99.5% | 99.7% | 99.7% | 99.7% | 99.7% | 99.7% | 27.6 / 37.4 | 28.8 |
| 120 | 799 | 99.6% | 99.7% | 99.7% | 99.7% | 99.7% | 99.7% | 23.1 / 32.6 | 32.7 |

Non-card crops, best distance (chosen w): p05 59.2, p50 71.5, p90 81.5

### Learned embedding

Top-1 by card height: 32px 98.4%, 48px 99.6%, 72px 99.9%, 120px 99.9%.
Correct matches' similarity p05 0.785, p50 0.882; lead p10 0.177. Non-cards' best similarity p50 0.431, p99 0.642.
Accepted (similarity ≥ 0.642, lead ≥ 0.02) and correct: 32px 91.7%, 48px 99.2%, 72px 99.9%, 120px 99.9%

Share of cards identified correctly *and* under the cut-off: 32px 81.6%, 48px 93.5%, 72px 96.4%, 120px 99.4%
