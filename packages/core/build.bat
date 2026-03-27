@echo off
echo Building MostBox distribution...

if exist build rmdir /s /q build
mkdir build

copy package.json build\
copy server.js build\
xcopy src build\src /E /I /Y
xcopy public build\public /E /I /Y
copy start.bat build\

cd build
call npm install --production
cd ..

echo.
echo Creating zip archive...
powershell -Command "Compress-Archive -Path 'build\*' -DestinationPath 'most-box.zip' -Force"

echo.
echo Build complete! Output: most-box.zip
pause
