from pathlib import Path

path = Path('openapi/sesn.v1.yaml')
text = path.read_text(encoding='utf-8')

if '/companies/{companyId}/sales-activities:' in text:
    raise SystemExit('sales activity path already exists in Main baseline')
if '\n    SalesActivity:\n' in text:
    raise SystemExit('sales activity schema already exists in Main baseline')

path_marker = '  /contacts:\n'
if text.count(path_marker) != 1:
    raise SystemExit(f'contacts path marker count={text.count(path_marker)}')

path_block = '''  /companies/{companyId}/sales-activities:
    get:
      operationId: listCompanySalesActivities
      parameters:
        - { name: companyId, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 200, default: 50 } }
        - { name: cursor, in: query, schema: { type: string, maxLength: 500 } }
      responses:
        '200':
          description: Authorized company sales activity timeline
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SalesActivityList' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
    post:
      operationId: createCompanySalesActivity
      parameters:
        - { name: companyId, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: x-request-id, in: header, schema: { type: string, minLength: 1, maxLength: 200 } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/SalesActivityInput' }
      responses:
        '201':
          description: Sales activity and optional follow-up task created atomically
          content:
            application/json:
              schema: { $ref: '#/components/schemas/SalesActivityCreateResult' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }
'''
text = text.replace(path_marker, path_block + path_marker, 1)

schema_marker = '    Company:\n'
if text.count(schema_marker) != 1:
    raise SystemExit(f'Company schema marker count={text.count(schema_marker)}')

schema_block = '''    SalesActivityType:
      type: string
      enum: [call, email, meeting, visit, proposal, follow_up, other]
    SalesActivityDirection:
      type: string
      enum: [inbound, outbound, internal]
    SalesActivityPriority:
      type: string
      enum: [low, normal, high, urgent]
    SalesActivityTaskStatus:
      type: string
      enum: [open, in_progress, blocked, completed, cancelled]
    SalesActivityContact:
      type: object
      additionalProperties: false
      required: [id, familyName, givenName, departmentName, positionTitle]
      properties:
        id: { type: string, format: uuid }
        familyName: { type: string }
        givenName: { type: [string, 'null'] }
        departmentName: { type: [string, 'null'] }
        positionTitle: { type: [string, 'null'] }
    SalesActivityProject:
      type: object
      additionalProperties: false
      required: [id, managementNo, projectName]
      properties:
        id: { type: string, format: uuid }
        managementNo: { type: string }
        projectName: { type: string }
    SalesActivityEngineer:
      type: object
      additionalProperties: false
      required: [id, managementNo, displayName]
      properties:
        id: { type: string, format: uuid }
        managementNo: { type: string }
        displayName: { type: string }
    SalesActivityFollowUpTask:
      type: object
      additionalProperties: false
      required: [id, title, status, priority, dueAt, completedAt, rowVersion]
      properties:
        id: { type: string, format: uuid }
        title: { type: string }
        description: { type: [string, 'null'] }
        status: { $ref: '#/components/schemas/SalesActivityTaskStatus' }
        priority: { $ref: '#/components/schemas/SalesActivityPriority' }
        dueAt: { type: [string, 'null'], format: date-time }
        completedAt: { type: [string, 'null'], format: date-time }
        rowVersion: { type: integer, minimum: 1 }
    SalesActivity:
      type: object
      additionalProperties: false
      required: [id, companyId, activityType, direction, occurredAt, subject, summary, result, contact, project, engineer, followUpTask, createdAt, updatedAt, rowVersion]
      properties:
        id: { type: string, format: uuid }
        companyId: { type: string, format: uuid }
        activityType: { $ref: '#/components/schemas/SalesActivityType' }
        direction:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityDirection' }
            - { type: 'null' }
        occurredAt: { type: string, format: date-time }
        subject: { type: string, minLength: 1, maxLength: 300 }
        summary: { type: string, minLength: 1, maxLength: 10000 }
        result: { type: [string, 'null'], maxLength: 10000 }
        contact:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityContact' }
            - { type: 'null' }
        project:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityProject' }
            - { type: 'null' }
        engineer:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityEngineer' }
            - { type: 'null' }
        followUpTask:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityFollowUpTask' }
            - { type: 'null' }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
        rowVersion: { type: integer, minimum: 1 }
    SalesActivityListPage:
      type: object
      additionalProperties: false
      required: [limit, nextCursor]
      properties:
        limit: { type: integer, minimum: 1, maximum: 200 }
        nextCursor: { type: [string, 'null'] }
    SalesActivityList:
      type: object
      additionalProperties: false
      required: [items, page]
      properties:
        items:
          type: array
          items: { $ref: '#/components/schemas/SalesActivity' }
        page: { $ref: '#/components/schemas/SalesActivityListPage' }
    SalesActivityFollowUpInput:
      type: object
      additionalProperties: false
      required: [title, dueAt, priority]
      properties:
        title: { type: string, minLength: 1, maxLength: 300 }
        description: { type: [string, 'null'], maxLength: 10000 }
        dueAt: { type: string, format: date-time }
        priority: { $ref: '#/components/schemas/SalesActivityPriority' }
    SalesActivityInput:
      type: object
      additionalProperties: false
      required: [activityType, occurredAt, subject, summary]
      properties:
        activityType: { $ref: '#/components/schemas/SalesActivityType' }
        direction:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityDirection' }
            - { type: 'null' }
        occurredAt: { type: string, format: date-time }
        subject: { type: string, minLength: 1, maxLength: 300 }
        summary: { type: string, minLength: 1, maxLength: 10000 }
        result: { type: [string, 'null'], maxLength: 10000 }
        companyContactId: { type: [string, 'null'], format: uuid }
        projectId: { type: [string, 'null'], format: uuid }
        engineerId: { type: [string, 'null'], format: uuid }
        followUp:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityFollowUpInput' }
            - { type: 'null' }
    SalesActivityCreatedActivity:
      type: object
      additionalProperties: false
      required: [id, companyId, activityType, direction, occurredAt, subject, summary, result, createdAt, updatedAt, rowVersion]
      properties:
        id: { type: string, format: uuid }
        companyId: { type: string, format: uuid }
        activityType: { $ref: '#/components/schemas/SalesActivityType' }
        direction:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityDirection' }
            - { type: 'null' }
        occurredAt: { type: string, format: date-time }
        subject: { type: string }
        summary: { type: string }
        result: { type: [string, 'null'] }
        createdAt: { type: string, format: date-time }
        updatedAt: { type: string, format: date-time }
        rowVersion: { type: integer, minimum: 1 }
    SalesActivityCreateResult:
      type: object
      additionalProperties: false
      required: [activity, followUpTask]
      properties:
        activity: { $ref: '#/components/schemas/SalesActivityCreatedActivity' }
        followUpTask:
          oneOf:
            - { $ref: '#/components/schemas/SalesActivityFollowUpTask' }
            - { type: 'null' }
'''
text = text.replace(schema_marker, schema_block + schema_marker, 1)
path.write_text(text, encoding='utf-8')
