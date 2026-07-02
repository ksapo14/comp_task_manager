from .schemas import TaskRead


def task_is_blocked(task: TaskRead, tasks_by_id: dict[str, TaskRead]) -> bool:
    return any(
        blocker_id in tasks_by_id and not tasks_by_id[blocker_id].is_completed
        for blocker_id in task.blocked_by_task_ids
    )


def apply_blocked_state(tasks: list[TaskRead]) -> list[TaskRead]:
    tasks_by_id = {task.id: task for task in tasks}
    for task in tasks:
        task.is_blocked = task_is_blocked(task, tasks_by_id)
    return tasks


def dependency_graph_has_cycle(
    task_id: str,
    blocker_ids: list[str],
    tasks: list[TaskRead],
) -> bool:
    graph = {task.id: list(task.blocked_by_task_ids) for task in tasks}
    graph[task_id] = blocker_ids
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node_id: str) -> bool:
        if node_id in visiting:
            return True
        if node_id in visited:
            return False
        visiting.add(node_id)
        if any(visit(dependency_id) for dependency_id in graph.get(node_id, [])):
            return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    return any(visit(node_id) for node_id in graph)
