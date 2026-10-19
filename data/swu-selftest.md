## Picture index: swu

6238 artworks, 0.5 MB. Chosen colour weight 3, max distance 61.5.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 660 | 86.4% | 91.2% | 93.9% | 96.2% | 96.8% | 97.0% | 44.7 / 63.2 | 7.6 |
| 48 | 660 | 85.6% | 90.3% | 93.5% | 94.7% | 95.6% | 95.5% | 43.7 / 62.1 | 8.8 |
| 72 | 660 | 86.8% | 90.2% | 92.9% | 94.2% | 94.5% | 94.8% | 42.5 / 60.6 | 10.0 |
| 120 | 660 | 91.8% | 93.9% | 95.6% | 97.4% | 97.6% | 97.7% | 36.7 / 55.2 | 9.7 |

Non-card crops, best distance (chosen w): p05 71.1, p50 93.4, p90 106.6

### Learned embedding

Top-1 by card height: 32px 97.7%, 48px 99.7%, 72px 100.0%, 120px 100.0%.
Correct matches' similarity p05 0.737, p50 0.862; lead p10 0.132. Non-cards' best similarity p50 0.502, p99 0.708.
Accepted (similarity ≥ 0.708, lead ≥ 0.02) and correct: 32px 53.3%, 48px 94.5%, 72px 99.8%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 89.8%, 48px 90.3%, 72px 90.6%, 120px 96.5%
