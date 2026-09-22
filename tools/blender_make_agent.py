# Blender 无头脚本：生成原创低多边形人物 + 骨架 + 四动画，导出 GLB
# 流程（手册 §8.1/§8.2）：确定尺寸 → 建模 → 简单材质 → 绑骨 → 动画 → 导出 GLB
# 米制尺寸：站立总高约 1.8m。全部原创几何，不使用任何游戏资产。
import bpy
import math
from mathutils import Vector

# ---------- 清理场景 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- 骨架 ----------
arm_data = bpy.data.armatures.new("Rig")
arm_obj = bpy.data.objects.new("Rig", arm_data)
bpy.context.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode='EDIT')

def add_bone(name, head, tail, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = arm_data.edit_bones[parent]
    return b

# 骨架尺寸（米）：脚底 z=0，头顶尖约 1.8
add_bone("Hips", (0, 0, 0.95), (0, 0, 1.05))
add_bone("Spine", (0, 0, 1.05), (0, 0, 1.45), "Hips")
add_bone("Head", (0, 0, 1.45), (0, 0, 1.80), "Spine")
add_bone("Thigh.L", (0.11, 0, 0.95), (0.11, 0, 0.50), "Hips")
add_bone("Calf.L", (0.11, 0, 0.50), (0.11, 0, 0.05), "Thigh.L")
add_bone("Thigh.R", (-0.11, 0, 0.95), (-0.11, 0, 0.50), "Hips")
add_bone("Calf.R", (-0.11, 0, 0.50), (-0.11, 0, 0.05), "Thigh.R")
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- 低模网格（方块组合，每块 100% 绑到对应骨） ----------
def add_box(name, loc, scale, bone_name, color):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    mat = bpy.data.materials.new(name + "Mat")
    mat.diffuse_color = (*color, 1.0)
    # glTF 导出读 Principled BSDF 节点的基础色，不是 viewport 的 diffuse_color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.85
    o.data.materials.append(mat)
    # 绑定：骨骼形变 + 顶点组全权重
    vg = o.vertex_groups.new(name=bone_name)
    vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    mod = o.modifiers.new("Armature", 'ARMATURE')
    mod.object = arm_obj
    o.parent = arm_obj
    return o

BODY = (0.70, 0.24, 0.28)   # 躯干红（与训练目标配色一致）
DARK = (0.16, 0.17, 0.20)
SKIN = (0.85, 0.85, 0.85)

add_box("Torso", (0, 0, 1.25), (0.42, 0.24, 0.42), "Spine", BODY)
add_box("Pelvis", (0, 0, 0.95), (0.36, 0.22, 0.20), "Hips", DARK)
add_box("Head", (0, 0, 1.62), (0.24, 0.24, 0.26), "Head", SKIN)
add_box("ThighL", (0.11, 0, 0.72), (0.13, 0.15, 0.45), "Thigh.L", DARK)
add_box("CalfL", (0.11, 0, 0.28), (0.11, 0.13, 0.45), "Calf.L", BODY)
add_box("ThighR", (-0.11, 0, 0.72), (0.13, 0.15, 0.45), "Thigh.R", DARK)
add_box("CalfR", (-0.11, 0, 0.28), (0.11, 0.13, 0.45), "Calf.R", BODY)

# ---------- 动画（四个：待机 / 左移 / 右移 / 蹲下 / 受击） ----------
FPS = 24

def new_action(name):
    act = bpy.data.actions.new(name)
    arm_obj.animation_data_create()
    arm_obj.animation_data.action = act
    return act

def key(bone_name, frame, rot=None, loc=None):
    pb = arm_obj.pose.bones[bone_name]
    if rot is not None:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = rot
        pb.keyframe_insert("rotation_euler", frame=frame)
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert("location", frame=frame)

# 待机：轻微呼吸起伏
new_action("Idle")
key("Spine", 1, rot=(0, 0, 0))
key("Spine", 24, rot=(math.radians(2), 0, 0))
key("Spine", 48, rot=(0, 0, 0))
key("Hips", 1, loc=(0, 0, 0))
key("Hips", 24, loc=(0, 0, -0.01))
key("Hips", 48, loc=(0, 0, 0))

# 左移：双腿交错摆动（原地踏步感，位移由代码控制）
def strafe_action(name, phase):
    new_action(name)
    key("Thigh.L", 1, rot=(math.radians(20 * phase), 0, 0))
    key("Thigh.L", 12, rot=(math.radians(-20 * phase), 0, 0))
    key("Thigh.L", 24, rot=(math.radians(20 * phase), 0, 0))
    key("Calf.L", 1, rot=(math.radians(-15 * phase), 0, 0))
    key("Calf.L", 12, rot=(math.radians(10 * phase), 0, 0))
    key("Calf.L", 24, rot=(math.radians(-15 * phase), 0, 0))
    key("Thigh.R", 1, rot=(math.radians(-20 * phase), 0, 0))
    key("Thigh.R", 12, rot=(math.radians(20 * phase), 0, 0))
    key("Thigh.R", 24, rot=(math.radians(-20 * phase), 0, 0))
    key("Calf.R", 1, rot=(math.radians(10 * phase), 0, 0))
    key("Calf.R", 12, rot=(math.radians(-15 * phase), 0, 0))
    key("Calf.R", 24, rot=(math.radians(10 * phase), 0, 0))

strafe_action("StrafeLeft", 1)
strafe_action("StrafeRight", -1)

# 蹲下：髋部下沉、大小腿弯曲
new_action("Crouch")
key("Hips", 1, loc=(0, 0, 0))
key("Hips", 12, loc=(0, 0, -0.38))
key("Thigh.L", 12, rot=(math.radians(65), 0, 0))
key("Calf.L", 12, rot=(math.radians(-80), 0, 0))
key("Thigh.R", 12, rot=(math.radians(65), 0, 0))
key("Calf.R", 12, rot=(math.radians(-80), 0, 0))
key("Hips", 24, loc=(0, 0, -0.38))

# 受击：上身快速后仰回弹
new_action("Hit")
key("Spine", 1, rot=(0, 0, 0))
key("Spine", 3, rot=(math.radians(-18), 0, 0))
key("Spine", 10, rot=(0, 0, 0))

# ---------- 全部动作推入 NLA，导出时成为独立动画剪辑 ----------
arm_obj.animation_data.action = None
for act in bpy.data.actions:
    tr = arm_obj.animation_data.nla_tracks.new()
    tr.name = act.name
    tr.strips.new(act.name, 1, act)
    tr.mute = True

# ---------- 导出 GLB ----------
bpy.ops.object.select_all(action='SELECT')
out = r"D:\1\kimi1\warmup-lab\public\assets\models\agent.glb"
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='NLA_TRACKS',
    export_yup=True,      # glTF 约定 Y 向上；导出后检查朝向/脚底/缩放（手册 §8.2）
    export_apply=True,
)
print("EXPORTED", out)
