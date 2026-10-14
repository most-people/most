cmake_minimum_required(VERSION 4.0)
project(mostbox_android_runtime LANGUAGES C CXX)

# Cross compilation restricts package searches to the Android sysroot. The
# build tools are Node packages on the host, so resolve their configs explicitly.
file(GLOB cmake_packages "${MOST_BARE_SOURCE}/node_modules/cmake-*")
foreach(package IN LISTS cmake_packages)
  get_filename_component(package_name "${package}" NAME)
  set("${package_name}_DIR" "${package}")
endforeach()
set(cmake-fuzz_DIR "${CMAKE_CURRENT_LIST_DIR}/../../node_modules/cmake-fuzz")

# API 29 lacks the public NDK NativeHelper target. MostBox already supplies this
# JNI helper in the APK; linking the same implementation keeps one Java VM.
add_library(nativehelper SHARED "${MOST_NATIVE_HELPER_SOURCE}")
target_link_libraries(nativehelper dl log)
add_library(JNI::NativeHelper ALIAS nativehelper)
add_subdirectory("${MOST_BARE_SOURCE}" bare-kit)
