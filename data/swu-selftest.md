## Picture index: swu

6238 artworks, 0.5 MB. Chosen colour weight 3, max distance 60.8.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 671 | 85.4% | 90.6% | 93.4% | 95.1% | 95.7% | 96.1% | 45.5 / 64.2 | 8.0 |
| 48 | 671 | 87.9% | 90.9% | 93.4% | 94.8% | 95.7% | 96.3% | 43.9 / 62.5 | 8.6 |
| 72 | 671 | 87.8% | 91.2% | 93.4% | 94.9% | 95.4% | 96.1% | 42.0 / 59.0 | 8.7 |
| 120 | 671 | 90.9% | 93.1% | 95.4% | 96.6% | 96.7% | 96.4% | 36.8 / 53.4 | 11.6 |

Non-card crops, best distance (chosen w): p05 71.5, p50 93.8, p90 106.1

### Learned embedding

Top-1 by card height: 32px 96.4%, 48px 99.9%, 72px 99.9%, 120px 100.0%.
Correct matches' similarity p05 0.744, p50 0.862; lead p10 0.132. Non-cards' best similarity p50 0.502, p99 0.694.
Accepted (similarity ≥ 0.694, lead ≥ 0.02) and correct: 32px 57.4%, 48px 97.0%, 72px 99.9%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 88.5%, 48px 90.3%, 72px 92.4%, 120px 95.7%
