## Picture index: swu

6238 artworks, 0.5 MB. Chosen colour weight 3, max distance 61.1.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 669 | 80.0% | 85.9% | 91.0% | 93.4% | 94.0% | 94.3% | 45.0 / 64.1 | 6.0 |
| 48 | 669 | 82.5% | 88.0% | 91.8% | 92.8% | 93.1% | 93.7% | 44.0 / 62.5 | 6.4 |
| 72 | 669 | 83.3% | 88.5% | 91.3% | 93.3% | 93.6% | 94.0% | 42.4 / 59.6 | 7.1 |
| 120 | 669 | 88.9% | 92.2% | 94.8% | 95.5% | 96.7% | 96.7% | 37.2 / 53.6 | 7.0 |

Non-card crops, best distance (chosen w): p05 69.5, p50 94.6, p90 106.4

### Learned embedding

Top-1 by card height: 32px 96.6%, 48px 100.0%, 72px 100.0%, 120px 100.0%.
Correct matches' similarity p05 0.737, p50 0.865; lead p10 0.133. Non-cards' best similarity p50 0.497, p99 0.691.
Accepted (similarity ≥ 0.691, lead ≥ 0.02) and correct: 32px 59.8%, 48px 97.5%, 72px 99.6%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 86.5%, 48px 88.0%, 72px 90.6%, 120px 96.1%
