# Phase 305 absolute collector ready

Date: 2026-08-24

## Decision

The local collector is ready for the one real 30-decision absolute-rating run
at `http://127.0.0.1:4214/collector/`. No human outcome exists yet.

## Verified identity

- Public study source SHA-256:
  `5357e7cdd9aa997a33da603f8f0ba7c7db71503dd588b7e9c39d0825e9229391`.
- Hidden audit-key SHA-256:
  `2222e47915f3f72530bf66e7c373cdfa02193c90827854fb229423f2366ad8ba`.
- Final collector HTML/CSS/JavaScript SHA-256:
  `ca33b1779288225c3193eeea4145a85669c1e2f18ff0c043bb09f73087206f2b` /
  `30d4bf2e1a2f1d261b46dec62096ebd8c9ab32c25de4652b91cdb76b0fbc6ada` /
  `e34746248ac35ad24e864f3f2e19a90627600bb67d7f7170ac9e9b765390fd06`.

## Browser verification

- The production study URL returned HTTP 200 and loaded task 1/30 with the
  expected brief, one name, three choices, disabled Previous control, and no
  visible source or score metadata.
- The pre-open completion-screen visibility defect was fixed and rechecked.
- On an isolated localhost origin, clicking a choice advanced to 2/30, Previous
  returned to 1/30, replacing a decision worked, and 30 synthetic UI actions
  reached the completion/download screen. These synthetic actions are UI tests
  only and never enter the human evidence.
- Browser error/warning logs were empty.
- The collector was reloaded on the untouched production-study origin and left
  at 1/30. No decision exists there.

The user should answer instinctively, download
`phase305-absolute-collection.json`, and attach it to the task. The frozen
auditor then determines the result; no threshold or candidate may change.
