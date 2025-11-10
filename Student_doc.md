# SYSTEM DESCRIPTION:

We’re building a distributed platform where each patient has a secure, centralized profile aggregating all their lab results and medical interactions across specialties. Docker-based microservices will manage authentication, profile data, and analysis of tests. Doctors—from family practitioners to specialists—can access a patient’s complete history (dates, values, notes) via a REST API. A dedicated scheduling microservice tracks test dates and automatically sends reminders when new work is due. The system ensures data privacy, seamless collaboration among care teams, and timely alerts so that clinicians and patients can stay proactive about long-term health maintenance.


# USER STORIES:

1) As a patient, I want to register.  
2) As a patient, I want to login.  
3) As a patient, I want the site to remember my password.  
4) As a patient, I want to logout.  
5) As a doctor, I want to register.  
6) As a doctor, I want to login.  
7) As a doctor, I want the site to remember my password.  
8) As a doctor, I want to logout.
9) As a doctor, I want to add patients to my list of patients.
10) As a doctor, I want to remove patients to my list of patients.
11) As a doctor, I want to search patients. 
12) As a doctor, I want to see the entire medical profile of my patients.			
13) As a doctor, I want to upload the analysis reports of my patients.
14) As a doctor, I want to delete my reports.		
15) As a doctor, I want to share the analysis reports with the patients, with explanation.
16) As a doctor, I want to filter my reports by sector.			
17) As a patient, I want to visualize the analysis reports shared by the doctor. 			
18) As a doctor, I want to have contact of patients along with reports.			
19) As a patient, I want to be notified by the doctor if he sees bad things in reports.
20) As a doctor, I want to send messages to my patients through a chat in case of further explanation.
21) As a patient, I want to send messages to my doctors through a chat in case of explanation, after the doctor has contacted me.
22) As a doctor, I want to contact other doctors of my patients via email.		
23) As a doctor, I want to have contact of other doctors of my patients for a further comparison.
24) As a doctor, I want to send messages to other doctors of my patients through a chat. 		
25) As a doctor, I want to access analysis reports of other sectors.
26) As a patient, I want to be notified when it's time to get new analysis.			
27)	As a doctor, I want to set the reminder cadence per test type.
28) As a doctor, I want to edit the reminder.			
29)	As a patient, I want to see a timeline with upcoming reminders and notification history.			
30)	As a patient, I want to manage my contact info & notification preferences from profile.			
31)	As a patient, I want to export my reports as PDF.
32) As a doctor, I want to remove a reminder.
33) As a patient, I want to be able to open the report file.
34) As a patient, I want to reply to the report once received.			

# CONTAINERS:

## CONTAINER_NAME: Authentication backend

### DESCRIPTION: 
Manages all functionalities related to registration, login, password and logout for patients and doctors.

### USER STORIES:
1) As a patient, I want to register.  
2) As a patient, I want to login.  
3) As a patient, I want the site to remember my password.  
4) As a patient, I want to logout.  
5) As a doctor, I want to register.  
6) As a doctor, I want to login.  
7) As a doctor, I want the site to remember my password.  
8) As a doctor, I want to logout. 

### PORTS: 
4000:4000

### DESCRIPTION:
Manages all functionalities related to registration, login, password and logout for patients and doctors.

### PERSISTENCE EVALUATION
The Authentication backend container does not require data persistence to manage token creation and validation.

### EXTERNAL SERVICES CONNECTIONS
The Authentication backend container uses MongoDB as Database to keep all data about patients and doctors.

### MICROSERVICES:

#### MICROSERVICE: auth-service
- TYPE: backend
- DESCRIPTION: Manages the creation and verification of tokens.
- PORTS: 4000:4000
- TECHNOLOGICAL SPECIFICATION:
The microservice is developed in javascript.
It uses the following libraries and technologies:
    - JWT (pyjwt): The microservice handles JSON Web Tokens (JWT), commonly used for secure token-based authentication.
    - bcrypt: The library that uses a password-hashing function that securely stores user credentials by applying salting and computationally expensive hashing to protect against brute-force and rainbow table attacks.
- SERVICE ARCHITECTURE: 
The service uses a single file js to manage login and signup, with functions to create and evaluate JWT tokens and another single file to manage all connections between nodes and the db (index.js).

- ENDPOINTS:
		
	| HTTP METHOD | URL | Description | User Stories |
	| ----------- | --- | ----------- | ------------ |
    | POST | /register | Creates encrypted password and creates and sends out a JWT token | 1, 5 |
	| POST | /login | Verifies encrypted password and creates and sends out a JWT token | 2, 6 |
	| GET | /me | Verifies the validity of a JWT token | 3, 7 |

- DB STRUCTURE: 

	users :	| _id | email | password | role | name | age | language | phone | timezone | notificationPrefs

## CONTAINER_NAME: Authentication frontend

### DESCRIPTION: 
Manages the authentication interface.

### USER STORIES:
1) As a patient, I want to register.  
2) As a patient, I want to login.  
3) As a patient, I want the site to remember my password.  
4) As a patient, I want to logout.  
5) As a doctor, I want to register.  
6) As a doctor, I want to login.  
7) As a doctor, I want the site to remember my password.  
8) As a doctor, I want to logout. 

### PORTS: 
9000:80

### DESCRIPTION:
Manages the authentication interface.

### PERSISTENCE EVALUATION
The Authentication frontend container does not require data persistence to manage token creation and validation.

### EXTERNAL SERVICES CONNECTIONS
The Authentication frontend container does not use any external service.

### MICROSERVICES:

#### MICROSERVICE: auth-ui
- TYPE: frontend
- DESCRIPTION: Manages the authentication interface.
- PORTS: 9000:80
- TECHNOLOGICAL SPECIFICATION:
The microservice is developed in HTML, CSS, javascript.
- SERVICE ARCHITECTURE: 
The service uses HTML files to show the pages of authentication, CSS to manage the style of HTML pages and javascript to link the html pages to backend.

- PAGES: 

	| Name | Description | Related Microservice | User Stories |
	| ---- | ----------- | -------------------- | ------------ |
	| login.html | Displays and manages the login page | auth-service | 2, 3, 6, 7 |
	| register.html | Displays and manages the registration page | auth-service | 1, 5 |
	| homepage.html | Displays and manages the homepage after the success of login | auth-service | 2, 6 |
	| login.js | Manages the login, redirecting to the correct page | auth-service | 2, 6 |
	| register.js | Manages the registration, redirecting to the login page | auth-service | 1, 5 |

## CONTAINER_NAME: Patient backend

### DESCRIPTION:
Handles operations related to patient functionalities such as viewing reports, messages, reminders, alerts and profile data. It interacts with the doctor-service to fetch reports and with the auth-service to validate JWT tokens.

### USER STORIES:
17) As a patient, I want to visualize the analysis reports shared by the doctor.      
19) As a patient, I want to be notified by the doctor if he sees bad things in reports.
21) As a patient, I want to send messages to my doctors through a chat in case of explanation, after the doctor has contacted me.
26) As a patient, I want to be notified when it's time to get new analysis.
29)	As a patient, I want to see a timeline with upcoming reminders and notification history.
30)	As a patient, I want to manage my contact info & notification preferences from profile.
31)	As a patient, I want to export my data as PDF.
33) As a patient, I want to be able to open the report file.
34) As a patient, I want to reply to the report once received.

### PORTS: 
4002:4002

### DESCRIPTION:
The patient-service container is a Node.js (Express) backend service dedicated to patient interactions. It manages API endpoints that require JWT authentication with role=patient. It integrates with MongoDB for persistence and communicates with doctor-service for report data.

### PERSISTENCE EVALUATION
The patient-service container requires persistent storage for patient data, reminders, messages and reports metadata. Persistence is achieved through MongoDB (connection defined by `MONGODB_URI`).

### EXTERNAL SERVICES CONNECTIONS
- Connects to MongoDB for data storage.
- Connects to doctor-service (default `http://doctor:4001`) to fetch report links.
- Validates tokens created by auth-service using `JWT_SECRET`.

### MICROSERVICES:

#### MICROSERVICE: patient-service
- TYPE: backend
- DESCRIPTION: Provides REST API endpoints for patient-related operations.
- PORTS: 4002
- TECHNOLOGICAL SPECIFICATION:
  - Node.js with Express
  - Mongoose for MongoDB integration
  - JWT for authentication/authorization
- SERVICE ARCHITECTURE:
  - Routes defined under `src/routes/patient.js`
  - Controllers for handling business logic
  - Models for MongoDB collections


- ENDPOINTS:

| HTTP METHOD | URL | Description | User Stories |
| ----------- | --- | ----------- | ------------ |
| GET | /me | Returns authenticated user id/role  | 2 |
| GET | /my/shared-reports | Returns patient reports shared by the doctor  | 17 |
| GET | /my/messages | Returns patient messages (with doctorName) | 21 |
| PUT | /my/messages/:id/read | Marks a message as read (sets `readAt`) | 26, 29 |
| POST | /my/messages | Sends a new message to a doctor  | 21, 34 |
| GET | /my/unread-count | Returns unread messages count addressed to the patient | 21 |
| PUT | /my/read-thread/:reportId | Marks as read all messages in a report thread | 21 |
| PUT | /my/read-doctor/:doctorId | Marks as read all non-thread messages from a doctor | 21 |
| GET | /my/alerts-count | Returns unread alerts count | 26 |
| GET | /my/reminders-count | Returns unread reminders count | 26 |
| GET | /my/profile | Returns patient profile (name, email, phone, language, timezone, notificationPrefs) | 30 |
| PUT | /my/profile | Updates patient profile fields | 30 |
| PUT | /my/notification-prefs | Updates notification preferences  | 30 |
| GET | /my/reminders | Returns active reminders (with scheduling info) | 19, 29, 30 |
| GET | /my/reports/:id/pdf | Generates/streams a PDF for a report (native PDF, text→PDF, image→PDF, LibreOffice fallback) | 31, 33 |
| GET | /my/timeline | Returns notification history with summary (alerts/reminders) | 29 |

- DB STRUCTURE: 
reports : | _id | patientId | doctorId | doctorName | filename | storedName | mimeType | size | url | comment | sector | shared | sharedMessage | sharedAt | createdAt |

messages: | _id | type |  text | patientId | doctorId | reportId | createdAt | when | reminderId | 
fromUserId | toUserId | senderRole | readAt | meta{} | updatedAt |
	meta: {reminderId, firstImmediate}

reminders : | _id | patientId | doctorId | title | sector | frequencyDays | 
nextDueAt | lastCompletedAt |  lastNotifiedAt | active | notes | createdAt | updatedAt |

users : users :	| _id | email | password | role | name | age | language | phone | timezone | notificationPrefs {}
    notificationPrefs: { channels, digest, quietHours }




## CONTAINER_NAME: Patient frontend

### DESCRIPTION: 
Provides the user interface for patients, serving static HTML/JS pages through. Shows dashboards, shared reports, messages, reminders and profile; calls patient-service and auth-service.

### USER STORIES:
17) As a patient, I want to visualize the analysis reports shared by the doctor.      
19) As a patient, I want to be notified by the doctor if he sees bad things in reports.
21) As a patient, I want to send messages to my doctors through a chat in case of explanation, after the doctor has contacted me.
26) As a patient, I want to be notified when it's time to get new analysis.
29)	As a patient, I want to see a timeline with upcoming reminders and notification history.
30)	As a patient, I want to manage my contact info & notification preferences from profile.
31)	As a patient, I want to export my data as PDF.
33) As a patient, I want to be able to open the report file.
34) As a patient, I want to reply to the report once received.

### PORTS: 
9002:80

### PERSISTENCE EVALUATION
No persistence; serves static frontend assets

### EXTERNAL SERVICES CONNECTIONS
- auth-service: `http://localhost:4000/me`
- patient-service: `http://localhost:4002`
- doctor-service: `http://localhost:4001`

### MICROSERVICES:

#### MICROSERVICE: patient-ui
- TYPE: frontend
- DESCRIPTION: Serves static HTML/JS files for patient interaction.
- PORTS: 80 exposed as 9002
- TECHNOLOGICAL SPECIFICATION:
  - nginx, HTML/CSS/JavaScript, `bootstrap-auth.js` for auth token handling

- PAGES:
	
	| Page | Description | Related Microservice | User Stories |
	| ---- | ----------- | -------------------- | ------------ |
	| dashboard-patient.html | Patient dashboard UI | patient-service | 17, 19, 21 , 29|
	| dashboard-patient.js   | Logic for patient dashboard (data fetch & rendering) | patient-service | 17, 19, 21 , 29 |
	| my-messages.html | UI for patient messages | patient-service | 21 |
	| my-messages.js | Logic for patient messages (list, read/unread, send new) | patient-service | 21 |
	| my-reports.html | UI for viewing reports list and links | patient-service, doctor-service |  12, 21, 33, 34 |
	| my-reports.js | Logic for reports page (fetch, PDF export) | patient-service, doctor-service |  12, 21, 33, 34 |
	| my-profile.html | UI for patient profile | auth-service, patient-service | 20, 30 |
	| my-profile.js | Logic for patient profile (edit info & notification prefs) | auth-service, patient-service | 20, 30 |
	| bootstrap-auth.js | Script for managing login token & page protection | auth-service | 2 |

## CONTAINER_NAME: Doctor backend

### DESCRIPTION: 

Provides the user interface for doctors, serving static HTML/JS pages through. It shows the dashboard, shared reports with patients, the possinility to add and search for patients, notify follow-up plans and if something bad has to be under scrutiny. It communicates with auth-service and patient-service.

### USER STORIES:
9) As a doctor, I want to add patients to my list of patients.
10) As a doctor, I want to remove patients to my list of patients.
11) As a doctor, I want to search patients. 
12) As a doctor, I want to see the entire medical profile of my patients.			
13) As a doctor, I want to upload the analysis reports of my patients.
14) As a doctor, I want to delete my reports.		
15) As a doctor, I want to share the analysis reports with the patients, with explanation.
16) As a doctor, I want to filter my reports by sector.						
18) As a doctor, I want to have contact of patients along with reports.	
20) As a doctor, I want to send messages to my patients through a chat in case of further explanation.
22) As a doctor, I want to contact other doctors of my patients via email.      
23) As a doctor, I want to have contact of other doctors of my patients for a further comparison.
24) As a doctor, I want to send messages to other doctors of my patients through a chat.        
25) As a doctor, I want to access analysis reports of other sectors.
27) As a doctor, I want to set the reminder cadence per test type.
28) As a doctor, I want to edit the reminder.   		
32) As a doctor, I want to remove a reminder.

### PORTS: 
4001:4001

### DESCRIPTION:
The doctor-service container is a Node.js (Express) backend for doctor interactions.
It uses JWT authentication with role=doctor, stores data in MongoDB, supports file uploads, and exposes APIs for managing patients and reports.

### PERSISTENCE EVALUATION
The doctor-service container needs persistent storage to search for patients, assigned patients, patients profiles, report metadata, follow-up plans. Data persistence is handled via MongoDB (configured by MONGODB_URI).

### EXTERNAL SERVICES CONNECTIONS
- Connects to MongoDB for data storage.
- Connects to doctor-service (default `http://doctor:4001`) to give data.
- Validates tokens created by auth-service using `JWT_SECRET`.

### MICROSERVICES:

#### MICROSERVICE: doctor-service
- TYPE: backend
- DESCRIPTION: Provides REST API endpoints for doctor-related operations.
- PORTS: 4001
- TECHNOLOGICAL SPECIFICATION:
  - Node.js with Express
  - Mongoose for MongoDB integration
  - JWT (JSON Web Tokens) for authentication/authorization
- SERVICE ARCHITECTURE:
  - Routes defined under `src/routes/doctor.js`, `src/routes/patientProfile.js`
  - Controllers for handling business logic
  - Models for MongoDB collections


- ENDPOINTS:

| HTTP METHOD | URL | Description | User Stories |
| ----------- | --- | ----------- | ------------ |
| GET | /me | Returns authenticated user id/role  of Doctor profile | 6 |
| GET | /patients | Returns patients assigned by the doctor  | 9 |
| POST | /patients/:email/add | Add patient | 9 |
| DELETE | /patients/:email/remove | Remove patient from doctor | 10 |
| GET | /my-patients | View my patients | 12 |
| GET | /patients/:id/profile |  | 19 |
| GET | /patient-id-by-email/:email | Get id by email | 22 |
| GET | /patients/all | See all the patients | 11, 19 |
| POST | /patients/:id/messages | Get messages with patient | 18, 20 |
| POST | /patients/:id/reports | Reports linked to individual | 13, 14, 15, 16 |
| DELETE | /reports/:id | Delete report linked to someone | 14 |
| PUT | /reports/:id/share | Share reports | 15 |
| GET | /my/messages | Get doctor messages  | 20, 24 |
| PUT | /my/read-patient/:patientId | Update messages read | 12 |
| PUT | /my/read-thread/:reportId | Update thread | 18 |
| POST | /reports/:id/alert | Insert/send new reports | 20, 25 |
| GET | /patients/:id/other-doctors | Get id of other doctors | 24 |
| POST | /patients/:patientId/doctors/:otherId/messages | Insert/send new messages | 20 |
| PUT | /my/read-doctor-peer/:patientId/:otherId | Doctor to doctor chat | 23, 24 |
| POST | /patients/:id/reminders | Reminders linked to patient | 16, 27 |
| GET | /patients/:id/reminders | Get reminder of patient | 27 |
| PUT | /reminders/:rid | Update reminder of patient  | 27, 28 |
| POST | /reminders/:rid/complete | Insert/send new reminder | 27 |
| DELETE | /reminders/:rid | Remove a reminder | 32 |


- DB STRUCTURE: 
isdoctorof : | _id | doctorId | patients

reports : | _id | patientId | doctorId | doctorName | filename | storedName | mimeType | size | url | comment | sector | shared | sharedMessage | sharedAt | createdAt |

messages: | _id | type |  text | patientId | doctorId | reportId | createdAt | when | reminderId | 
fromUserId | toUserId | senderRole | readAt | meta{} | updatedAt |
	meta: {reminderId, firstImmediate}

reminders : | _id | patientId | doctorId | title | sector | frequencyDays | 
nextDueAt | lastCompletedAt |  lastNotifiedAt | active | notes | createdAt | updatedAt |

users : users :	| _id | email | password | role | name | age | language | phone | timezone | notificationPrefs {}
    notificationPrefs: { channels, digest, quietHours }

## CONTAINER_NAME: Doctor frontend

### DESCRIPTION: 
The user interface of the doctor where it is possible to search/add patients and view them. It is also possible to add a follow-up plan, send reports, choose a category for the reports, etc.

### USER STORIES:
9) As a doctor, I want to add patients to my list of patients.
10) As a doctor, I want to remove patients to my list of patients.
11) As a doctor, I want to search patients. 
12) As a doctor, I want to see the entire medical profile of my patients.			
13) As a doctor, I want to upload the analysis reports of my patients.
14) As a doctor, I want to delete my reports.		
15) As a doctor, I want to share the analysis reports with the patients, with explanation.
16) As a doctor, I want to filter my reports by sector.						
18) As a doctor, I want to have contact of patients along with reports.	
20) As a doctor, I want to send messages to my patients through a chat in case of further explanation.
22) As a doctor, I want to contact other doctors of my patients via email.      
23) As a doctor, I want to have contact of other doctors of my patients for a further comparison.
24) As a doctor, I want to send messages to other doctors of my patients through a chat.        
25) As a doctor, I want to access analysis reports of other sectors.
27) As a doctor, I want to set the reminder cadence per test type.
28) As a doctor, I want to edit the reminder.   		
32) As a doctor, I want to remove a reminder.

### PORTS: 
9001:80

### PERSISTENCE EVALUATION
No persistence, static front-end is serve.

### EXTERNAL SERVICES CONNECTIONS
- auth-service: `http://localhost:4000/me`
- doctor-service: `http://localhost:4001`
- patient-service: `http://localhost:4002`

### MICROSERVICES:

#### MICROSERVICE: doctor-ui
- TYPE: front-end
- DESCRIPTION: Serves static HTML/JS files for doctor interaction.
- PORTS: 80 exposed as 9001
- TECHNOLOGICAL SPECIFICATION:
  - nginx, HTML/CSS/JavaScript, `bootstrap-auth.js` for auth token handling

- PAGES:
	
	| Page | Description | Related Microservice | User Stories |
	| ---- | ----------- | -------------------- | ------------ |
	| dashboard-doctor.html | Doctor dashboard | doctor-service | 11, 12 |
	| dashboard-doctor.js | Logic for doctor dashboard (data fetch & rendering) | doctor-service | 11, 12 |
	| my-messages.html | Doctor messages UI | doctor-service | 20, 24  |
	| my-messages.js | Logic for doctor messages (list, read/unread, send new) with patients and doctors | doctor-service | 20, 24 |
	| patient-profile.html | UI for viewing the doctor own list of patients| doctor-service, patient-service | 12, 13, 14, 15, 16, 18, 20, 22, 25, 27, 28, 32|
	| patient-profile.js | Logic for viewing the page (fetch data) linked to the patient | doctor-service, patient-service | 12, 13, 14, 15, 16, 18, 20, 22, 25, 27, 28, 32 |
	| searchpatients.html | Search all the possible patients | doctor-service, patient-service | 9, 11 |
	| searchpatients.js | Logic to search all the possible patients (add them) | doctor-service, patient-service | 9, 11 |
	| viewmypatients.html | View my patients  (view patient's profile or remove) | doctor-service, patient-service | 10, 12 |
	| viewmypatients.js | | Give the data necessary for the page | doctor-service, patient-service | 10, 12	 |
	| bootstrap-auth.js | Script for managing login token & page protection | auth-service | 6 |

