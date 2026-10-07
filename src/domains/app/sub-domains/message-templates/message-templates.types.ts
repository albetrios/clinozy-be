/** A message template as the API returns it (launch ROUTE #17). */
export interface MessageTemplateOutput {
  id: string;
  name: string;
  body: string;
  channel: string;
  created_at: string;
  updated_at: string;
}
