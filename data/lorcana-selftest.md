## Picture index: lorcana

3501 artworks, 0.3 MB. Chosen colour weight 1, max distance 26.8.

### Top-1 accuracy on degraded cards (by card height in px)

| height | n | w=0.25 | w=0.5 | w=1 | w=1.5 | w=2 | w=3 | dist p50 / p95 (hits, chosen w) | margin p10 |
|---|---|---|---|---|---|---|---|---|---|
| 32 | 800 | 98.4% | 99.8% | 100.0% | 100.0% | 100.0% | 100.0% | 23.0 / 30.3 | 13.3 |
| 48 | 800 | 99.1% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 20.5 / 27.5 | 15.8 |
| 72 | 800 | 99.8% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 19.2 / 25.5 | 18.3 |
| 120 | 800 | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 16.3 / 22.2 | 20.6 |

Non-card crops, best distance (chosen w): p05 39.9, p50 47.1, p90 52.2

### Learned embedding

Top-1 by card height: 32px 98.5%, 48px 100.0%, 72px 100.0%, 120px 100.0%.
Correct matches' similarity p05 0.786, p50 0.884; lead p10 0.166. Non-cards' best similarity p50 0.434, p99 0.697.
Accepted (similarity ≥ 0.697, lead ≥ 0.02) and correct: 32px 77.0%, 48px 99.8%, 72px 100.0%, 120px 100.0%

Share of cards identified correctly *and* under the cut-off: 32px 80.0%, 48px 92.8%, 72px 97.3%, 120px 99.1%
