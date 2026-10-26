## Picture index: swu

6238 artworks, 0.5 MB. Chosen colour weight 3, max distance 61.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 658 | 84.0% | 89.2% | 92.9% | 94.5% | 95.7% | 96.4% | 44.8 / 64.4 | 8.0 |
| 48 | 658 | 85.0% | 90.0% | 93.2% | 93.9% | 94.5% | 94.7% | 43.6 / 61.9 | 10.5 |
| 72 | 658 | 86.0% | 90.1% | 93.6% | 95.4% | 95.9% | 95.9% | 41.8 / 59.8 | 9.6 |
| 120 | 658 | 91.5% | 93.9% | 96.5% | 97.0% | 97.4% | 97.7% | 37.1 / 53.1 | 9.3 |

Non-card crops, best distance (chosen w): p05 72.2, p50 93.5, p90 106.4

### Learned embedding

Top-1 by card height: 32px 96.5%, 48px 99.8%, 72px 100.0%, 120px 100.0%.
Correct matches' similarity p05 0.743, p50 0.86; lead p10 0.132. Non-cards' best similarity p50 0.499, p99 0.669.
Accepted (similarity ≥ 0.669, lead ≥ 0.02) and correct: 32px 69.5%, 48px 97.9%, 72px 100.0%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 87.7%, 48px 89.5%, 72px 91.8%, 120px 96.2%
