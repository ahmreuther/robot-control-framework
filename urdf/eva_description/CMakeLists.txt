cmake_minimum_required(VERSION 3.10.2)

project(eva_description)

find_package(ament_cmake REQUIRED)

ament_package()

install(DIRECTORY config meshes collision_meshes urdf DESTINATION share/${PROJECT_NAME})
