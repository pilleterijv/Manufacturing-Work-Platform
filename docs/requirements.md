# Manufacturing Work Platform Requirements

## Version 1

### 1. Standard Work
- Users can select a standard work document.
- Standards contain ordered steps.
- Each step can require a Yes/No response.
- Each step can optionally require a photo.
- Users can enter comments.
- Responses are timestamped.
- Completed standard work runs are stored historically.

### 2. Time Study
- Users can create time studies.
- Time studies contain process steps or work elements.
- Users can perform multiple cycles.
- The app records raw timing data.
- The system calculates:
  - Average
  - Median
  - Minimum
  - Maximum
  - Range
  - Standard deviation
  - Cycle time by step

### 3. Equipment
- Standards and time studies can be associated with equipment.
- Equipment can belong to:
  - Plant
  - Department
  - Area
  - Line

### 4. Photos
- Users can take or upload photos.
- Photos can be attached to standard-work responses.
- Photos should not be stored directly in the main database.

### 5. Analytics
- Standard work completion rate
- Yes/No failure rate
- Failures by step
- Failures by equipment
- Average completion time
- Time-study statistics

### 6. Excel Export
- Export standard-work results to XLSX.
- Export time-study observations to XLSX.
- Export calculated statistics to XLSX.

## Future Modules
- Troubleshooting guides
- Centerlines
- Training
- Audits
- Changeovers
- 2D / 4D / 8D
- Equipment history
