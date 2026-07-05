#!/bin/bash

########################################################
# Runs tests in isolation to id broken tests. 
# Slower than `npm test` but more useful for debugging.
########################################################

# Initialize failures array
failures=()

# Function to run tests in a directory
run_tests_in_directory() {
  local dir=$1
  local base_dir=$2
  echo "Running tests in $dir directory"
  echo '─────────────────────────────────────────────────────────────'
  
  # Find all .test.js files recursively and run them
  while IFS= read -r -d '' file; do
    echo "Running: $file"
    
    # Run the test and capture exit code
    node "$file"
    exit_code=$?
    
    # If exit code is not 0, add to failures with full path
    if [ $exit_code -ne 0 ]; then
      echo "✘ Test failed: $file"
      # Store the full path relative to project root, removing any leading ./
      failures+=("$base_dir/${file#./}")
    fi
  done < <(find "$dir" -type f -name "*.test.js" -print0)
}

# Run tests in tests directory
cd "./tests" || { echo "Tests directory not found"; exit 1; }
run_tests_in_directory "." "tests"

# Run tests in src directory
cd "../src" || { echo "Src directory not found"; exit 1; }
run_tests_in_directory "." "src"

# Return to original directory
cd ..

# Report results
echo ""
echo "Test run complete"
echo "----------------"

if [ ${#failures[@]} -eq 0 ]; then
  echo "All tests passed!"
  exit 0
else
  echo ""
  echo "─────────────────────────────────────────────────────────────"
  echo "Failed tests (${#failures[@]}):"
  for failure in "${failures[@]}"; do
    echo "  - ./$failure"
  done
  echo "─────────────────────────────────────────────────────────────"
  echo ""
  echo ""

  # say "Some tests failed"
  
  # Play a distinctive sound when tests fail
  afplay /System/Library/Sounds/Basso.aiff

  exit 1
fi