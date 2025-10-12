import { prisma } from '@/lib/prisma'

export async function createTask(parameters: Record<string, any>, userId: string) {
  const { title, description, dueDate, priority = 'medium', assignedTo, relatedTo } = parameters
  
  try {
    const task = await prisma.task.create({
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority,
        assignedTo,
        relatedTo,
        userId,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    return {
      taskId: task.id,
      success: true,
      message: `Task "${title}" created successfully`,
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        priority: task.priority,
        status: task.status,
        assignedTo: task.assignedTo,
        relatedTo: task.relatedTo
      }
    }
  } catch (error) {
    throw new Error(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function saveOngoingInstruction(parameters: Record<string, any>, userId: string) {
  const { instruction, triggerEvents, priority = 5, active = true } = parameters
  
  try {
    const triggerEventsList = triggerEvents.split(',').map((event: string) => event.trim())
    
    const ongoingInstruction = await prisma.ongoingInstruction.create({
      data: {
        instruction,
        triggerEvents: triggerEventsList,
        priority,
        active,
        userId,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    return {
      instructionId: ongoingInstruction.id,
      success: true,
      message: `Ongoing instruction saved successfully`,
      instruction: {
        id: ongoingInstruction.id,
        instruction: ongoingInstruction.instruction,
        triggerEvents: ongoingInstruction.triggerEvents,
        priority: ongoingInstruction.priority,
        active: ongoingInstruction.active
      }
    }
  } catch (error) {
    throw new Error(`Failed to save ongoing instruction: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}