@echo off
echo Building MostBox distribution...

if exist dist rmdir /s /q dist
mkdir dist

copy package.json dist\
copy server.js dist\
xcopy src dist\src /E /I /Y
xcopy public dist\public /E /I /Y
copy start.bat dist\

cd dist
call npm install --production

echo.
echo Build complete! Distribution folder: dist\
echo Users need Node.js installed to run start.bat
pause
