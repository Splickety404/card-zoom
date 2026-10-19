## Picture index: lorcana

3501 artworks, 0.3 MB. Chosen colour weight 3, max distance 49.6.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 799 | 98.1% | 99.5% | 99.7% | 99.7% | 99.7% | 99.7% | 43.2 / 56.1 | 28.6 |
| 48 | 799 | 99.2% | 99.6% | 99.6% | 99.6% | 99.6% | 99.6% | 38.3 / 50.6 | 34.2 |
| 72 | 799 | 99.4% | 99.7% | 99.7% | 99.7% | 99.7% | 99.9% | 34.8 / 48.4 | 37.3 |
| 120 | 799 | 99.7% | 99.7% | 99.7% | 99.7% | 99.7% | 99.7% | 30.4 / 42.2 | 41.6 |

Non-card crops, best distance (chosen w): p05 76.9, p50 94.8, p90 108.4

### Learned embedding

Top-1 by card height: 32px 99.0%, 48px 100.0%, 72px 100.0%, 120px 100.0%.
Correct matches' similarity p05 0.784, p50 0.883; lead p10 0.169. Non-cards' best similarity p50 0.429, p99 0.708.
Accepted (similarity ≥ 0.708, lead ≥ 0.02) and correct: 32px 74.2%, 48px 98.9%, 72px 100.0%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 77.6%, 48px 93.2%, 72px 96.2%, 120px 99.4%
