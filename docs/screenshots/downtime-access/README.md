# Downtime selection and assignments

Screenshots use synthetic fixture users and machines from the production-build integration test.

- `operator-hierarchy.png`: department → area → machine selection, showing only the equipment assigned to the operator.
- `admin-assignments.png`: Admin controls for whole-department, area and individual-machine assignments.

Configure access under **Accounts → select a user → Downtime location access**. Existing users start with all-machine access; restricted mode with no assignments blocks downtime recording. Admin retains full access. Operational reads/exports follow the same scope; aggregate dashboard permissions are separate.

Reproduce with `npm run test:downtime-access` against a local test installation. The test removes its fixture records/accounts after capture.
