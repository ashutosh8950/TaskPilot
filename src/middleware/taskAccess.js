function canModifyTask(user, task) {
  return user.role === 'admin' || task.created_by === user.id || task.assignee_id === user.id;
}

module.exports = { canModifyTask };
