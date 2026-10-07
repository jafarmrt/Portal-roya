#!/bin/bash
find src -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i \
  -e 's/from-\[#2C3028\] via-\[#383D33\] to-\[#5B6350\]/from-\[#7f1d1d\] via-\[#991b1b\] to-\[#ef4444\]/g' \
  -e 's/\[#8C7355\]/\[#dc2626\]/g' \
  -e 's/\[#786146\]/\[#b91c1c\]/g' \
  -e 's/\[#5B6350\]/\[#991b1b\]/g' \
  -e 's/\[#4A5141\]/\[#7f1d1d\]/g' \
  -e 's/\[#2C3028\]/\[#7f1d1d\]/g' \
  -e 's/\[#3D4238\]/\[#7f1d1d\]/g' \
  -e 's/bg-red-500\/20/bg-red-500\/20/g' \
  {} +
